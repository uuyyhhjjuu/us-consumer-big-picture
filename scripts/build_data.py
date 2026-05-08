import argparse
import csv
import io
import json
import math
import statistics
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

INDUSTRY_ZIP = DATA / "49_Industry_Portfolios_CSV.zip"
FACTORS_ZIP = DATA / "F-F_Research_Data_Factors_CSV.zip"
OUT = DATA / "consumer-data.js"

FF_INDUSTRY_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/49_Industry_Portfolios_CSV.zip"
FF_FACTORS_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip"
YAHOO_CHART_URL = (
    "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    "?period1=0&period2=4102444800&interval=1d&events=history&includeAdjustedClose=true"
)

STAPLES = ["Food", "Soda", "Beer", "Smoke", "Hshld"]
DISCRETIONARY = ["Toys", "Fun", "Books", "Clths", "Autos", "Rtail", "Meals"]
ETF_TICKERS = {"staples": "xlp", "discretionary": "xly", "market": "spy"}


def download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "consumer-big-picture/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        path.write_bytes(response.read())


def maybe_download(download_ff=False, download_daily=False):
    if download_ff or not INDUSTRY_ZIP.exists():
        download(FF_INDUSTRY_URL, INDUSTRY_ZIP)
    if download_ff or not FACTORS_ZIP.exists():
        download(FF_FACTORS_URL, FACTORS_ZIP)
    for ticker in ETF_TICKERS.values():
        target = DATA / f"{ticker.upper()}_daily.csv"
        if download_daily:
            download_yahoo_chart(ticker.upper(), target)


def download_yahoo_chart(ticker, path):
    request = urllib.request.Request(
        YAHOO_CHART_URL.format(ticker=ticker),
        headers={"User-Agent": "Mozilla/5.0 consumer-big-picture/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    result = payload["chart"]["result"][0]
    timestamps = result["timestamp"]
    quote = result["indicators"]["quote"][0]
    adjclose = result["indicators"].get("adjclose", [{}])[0].get("adjclose", quote.get("close", []))
    rows = [["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"]]
    for idx, ts in enumerate(timestamps):
        close = quote.get("close", [])[idx]
        adj = adjclose[idx] if idx < len(adjclose) else close
        if close is None or adj is None:
            continue
        date = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")
        rows.append(
            [
                date,
                quote.get("open", [None])[idx],
                quote.get("high", [None])[idx],
                quote.get("low", [None])[idx],
                close,
                adj,
                quote.get("volume", [None])[idx],
            ]
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)


def parse_date(yyyymm):
    s = str(yyyymm).strip()
    return f"{s[:4]}-{s[4:]}"


def read_zip_text(path):
    with zipfile.ZipFile(path) as zf:
        name = zf.namelist()[0]
        return zf.read(name).decode("latin1")


def read_industries():
    text = read_zip_text(INDUSTRY_ZIP)
    lines = text.splitlines()
    start = None
    for idx, line in enumerate(lines):
        if line.strip().startswith("Average Value Weighted Returns -- Monthly"):
            start = idx + 1
            break
    if start is None:
        raise RuntimeError("Could not find monthly industry returns block")

    block = []
    for line in lines[start:]:
        if not line.strip():
            break
        block.append(line)

    rows = list(csv.DictReader(io.StringIO("\n".join(block))))
    clean_rows = []
    for row in rows:
        date = row[""].strip()
        values = {}
        for key, value in row.items():
            if key == "":
                continue
            k = key.strip()
            try:
                v = float(value)
            except (TypeError, ValueError):
                continue
            values[k] = None if v <= -99 else v / 100.0
        clean_rows.append({"date": parse_date(date), "values": values})
    return clean_rows


def read_market():
    text = read_zip_text(FACTORS_ZIP)
    lines = text.splitlines()
    start = None
    for idx, line in enumerate(lines):
        if line.startswith(",Mkt-RF"):
            start = idx
            break
    if start is None:
        raise RuntimeError("Could not find market factors block")

    block = []
    for line in lines[start:]:
        if not line.strip():
            break
        block.append(line)

    rows = list(csv.DictReader(io.StringIO("\n".join(block))))
    market = {}
    for row in rows:
        date = parse_date(row[""])
        mkt = float(row["Mkt-RF"]) / 100.0
        rf = float(row["RF"]) / 100.0
        market[date] = mkt + rf
    return market


def read_daily_prices(monthly_fallback=None):
    missing = [ticker for ticker in ETF_TICKERS.values() if not (DATA / f"{ticker.upper()}_daily.csv").exists()]
    if missing:
        if monthly_fallback is None:
            raise FileNotFoundError(f"Missing daily price files: {', '.join(missing)}")
        daily = []
        for point in monthly_fallback:
            daily.append(
                {
                    "date": f"{point['date']}-28",
                    "price": {},
                    "returns": {k: round(v, 6) for k, v in point["returns"].items()},
                    "levels": point["levels"],
                    "relative": {
                        "staples": round(point["levels"]["staples"] / point["levels"]["market"] * 100, 4),
                        "discretionary": round(point["levels"]["discretionary"] / point["levels"]["market"] * 100, 4),
                        "staplesVsDiscretionary": round(point["levels"]["staples"] / point["levels"]["discretionary"] * 100, 4),
                    },
                    "drawdown": point["drawdown"],
                    "volatility": {
                        "staples252d": point["volatility"].get("staples36m"),
                        "discretionary252d": point["volatility"].get("discretionary36m"),
                        "market252d": point["volatility"].get("market36m"),
                    },
                    "isFallback": True,
                }
            )
        return daily

    raw = {}
    for key, ticker in ETF_TICKERS.items():
        path = DATA / f"{ticker.upper()}_daily.csv"
        rows = list(csv.DictReader(path.read_text(encoding="utf-8").splitlines()))
        prices = {}
        for row in rows:
            try:
                close = float(row.get("Adj Close") or row["Close"])
            except (ValueError, KeyError):
                continue
            if close > 0:
                prices[row["Date"]] = close
        raw[key] = prices

    common_dates = sorted(set.intersection(*(set(v) for v in raw.values())))
    daily = []
    prev = {}
    start_prices = {key: raw[key][common_dates[0]] for key in raw}
    peaks = {key: 100.0 for key in raw}
    trailing = {key: [] for key in raw}

    for date in common_dates:
        point = {"date": date, "price": {}, "returns": {}, "levels": {}, "relative": {}, "drawdown": {}, "volatility": {}}
        for key in ["staples", "discretionary", "market"]:
            close = raw[key][date]
            level = close / start_prices[key] * 100
            ret = 0.0 if key not in prev else close / prev[key] - 1
            prev[key] = close
            peaks[key] = max(peaks[key], level)
            trailing[key].append(ret)
            if len(trailing[key]) > 252:
                trailing[key].pop(0)
            point["price"][key] = round(close, 4)
            point["returns"][key] = round(ret, 6)
            point["levels"][key] = round(level, 4)
            point["drawdown"][key] = round(level / peaks[key] - 1, 6)
            if len(trailing[key]) >= 20:
                point["volatility"][f"{key}20d"] = round(statistics.pstdev(trailing[key][-20:]) * math.sqrt(252), 6)
            if len(trailing[key]) >= 60:
                point["volatility"][f"{key}60d"] = round(statistics.pstdev(trailing[key][-60:]) * math.sqrt(252), 6)
            if len(trailing[key]) >= 252:
                point["volatility"][f"{key}252d"] = round(statistics.pstdev(trailing[key]) * math.sqrt(252), 6)

        point["relative"]["staples"] = round(point["levels"]["staples"] / point["levels"]["market"] * 100, 4)
        point["relative"]["discretionary"] = round(point["levels"]["discretionary"] / point["levels"]["market"] * 100, 4)
        point["relative"]["staplesVsDiscretionary"] = round(point["levels"]["staples"] / point["levels"]["discretionary"] * 100, 4)
        daily.append(point)
    return daily


def average_return(values, names):
    vals = [values.get(name) for name in names if values.get(name) is not None]
    return None if not vals else sum(vals) / len(vals)


def compound(returns):
    value = 1.0
    for r in returns:
        value *= 1 + r
    return value - 1


def cagr(start_value, end_value, years):
    if start_value <= 0 or end_value <= 0 or years <= 0:
        return None
    return (end_value / start_value) ** (1 / years) - 1


def percentile_rank(values, current):
    sorted_values = sorted(v for v in values if v is not None and math.isfinite(v))
    if not sorted_values:
        return None
    count = sum(1 for v in sorted_values if v <= current)
    return count / len(sorted_values)


def build_long_monthly():
    industries = read_industries()
    market = read_market()
    monthly = []
    levels = {"staples": 100.0, "discretionary": 100.0, "market": 100.0}
    rel_levels = {"staples": 100.0, "discretionary": 100.0, "staplesVsDiscretionary": 100.0}

    for row in industries:
        date = row["date"]
        if date not in market:
            continue
        s = average_return(row["values"], STAPLES)
        d = average_return(row["values"], DISCRETIONARY)
        m = market[date]
        if s is None or d is None:
            continue
        levels["staples"] *= 1 + s
        levels["discretionary"] *= 1 + d
        levels["market"] *= 1 + m
        rel_levels["staples"] *= (1 + s) / (1 + m)
        rel_levels["discretionary"] *= (1 + d) / (1 + m)
        rel_levels["staplesVsDiscretionary"] *= (1 + s) / (1 + d)
        monthly.append(
            {
                "date": date,
                "returns": {"staples": s, "discretionary": d, "market": m},
                "levels": {k: round(v, 4) for k, v in levels.items()},
                "relative": {k: round(v, 4) for k, v in rel_levels.items()},
            }
        )
    return monthly


def add_monthly_derived(monthly):
    peaks = {"staples": 0.0, "discretionary": 0.0, "market": 0.0}
    trailing = {"staples": [], "discretionary": [], "market": []}
    for point in monthly:
        point["drawdown"] = {}
        point["volatility"] = {}
        for key in peaks:
            level = point["levels"][key]
            peaks[key] = max(peaks[key], level)
            point["drawdown"][key] = round(level / peaks[key] - 1, 5)
            trailing[key].append(point["returns"][key])
            if len(trailing[key]) > 36:
                trailing[key].pop(0)
            if len(trailing[key]) >= 12:
                point["volatility"][f"{key}12m"] = round(statistics.pstdev(trailing[key][-12:]) * math.sqrt(12), 5)
            if len(trailing[key]) >= 36:
                point["volatility"][f"{key}36m"] = round(statistics.pstdev(trailing[key]) * math.sqrt(12), 5)


def build_annual(monthly, date_key="date"):
    by_year = {}
    for point in monthly:
        year = point[date_key][:4]
        by_year.setdefault(year, {"staples": [], "discretionary": [], "market": []})
        for key in by_year[year]:
            by_year[year][key].append(point["returns"][key])

    annual = []
    for year, vals in sorted(by_year.items()):
        row = {"year": int(year)}
        for key, returns in vals.items():
            row[key] = compound(returns)
        row["staplesExcess"] = row["staples"] - row["market"]
        row["discretionaryExcess"] = row["discretionary"] - row["market"]
        row["staplesVsDiscretionary"] = row["staples"] - row["discretionary"]
        annual.append({k: round(v, 5) if isinstance(v, float) else v for k, v in row.items()})
    return annual


def build_matrix(annual):
    years = [row["year"] for row in annual]
    by_year = {row["year"]: row for row in annual}
    matrices = {}
    for key in ["staples", "discretionary", "market"]:
        matrix = []
        for start in years:
            row = []
            value = 1.0
            for end in years:
                if end < start:
                    row.append(None)
                    continue
                value *= 1 + by_year[end][key]
                row.append(round(value ** (1 / (end - start + 1)) - 1, 5))
            matrix.append(row)
        matrices[key] = matrix
    return {"years": years, "matrices": matrices}


def build_bins(annual, key):
    bins = [
        (-1.0, -0.3, "< -30%"),
        (-0.3, -0.2, "-30%~-20%"),
        (-0.2, -0.1, "-20%~-10%"),
        (-0.1, 0.0, "-10%~0%"),
        (0.0, 0.1, "0%~10%"),
        (0.1, 0.2, "10%~20%"),
        (0.2, 0.3, "20%~30%"),
        (0.3, 0.5, "30%~50%"),
        (0.5, 10.0, "> 50%"),
    ]
    values = [row[key] for row in annual]
    return [{"label": label, "count": sum(1 for value in values if lo <= value < hi)} for lo, hi, label in bins]


def summary_stats(series, annual, key, vol_suffix):
    latest = series[-1]
    dds = [p["drawdown"][key] for p in series]
    vols = [p["volatility"].get(f"{key}{vol_suffix}") for p in series]
    vols = [v for v in vols if v is not None]
    annual_values = [row[key] for row in annual]
    periods_per_year = 252 if "-" in latest["date"] and len(latest["date"]) == 10 else 12
    years = len(series) / periods_per_year
    stats = {
        "latestIndex": latest["levels"][key],
        "cagr": cagr(series[0]["levels"][key], latest["levels"][key], years),
        "bestYear": max(annual_values),
        "worstYear": min(annual_values),
        "positiveYears": sum(1 for v in annual_values if v > 0) / len(annual_values),
        "maxDrawdown": min(dds),
        "currentDrawdown": latest["drawdown"][key],
        "currentVol": vols[-1] if vols else None,
        "volPercentile": percentile_rank(vols, vols[-1]) if vols else None,
        "lastDate": latest["date"],
    }
    return {k: round(v, 5) if isinstance(v, float) else v for k, v in stats.items()}


def build_dataset():
    monthly = build_long_monthly()
    add_monthly_derived(monthly)
    annual = build_annual(monthly)
    daily = read_daily_prices(monthly)
    daily_annual = build_annual(daily)

    dataset = {
        "meta": {
            "title": "Big Picture: US Consumer Sectors",
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "createdFrom": "Kenneth French Data Library, Fama/French Research Factors, Stooq ETF daily prices",
            "sourceVintage": "Fama-French files include their own CRSP vintage in the downloaded CSV header.",
            "longStart": monthly[0]["date"],
            "longEnd": monthly[-1]["date"],
            "dailyStart": daily[0]["date"],
            "dailyEnd": daily[-1]["date"],
            "dailyIsFallback": bool(daily[-1].get("isFallback")),
            "staplesProxy": STAPLES,
            "discretionaryProxy": DISCRETIONARY,
            "benchmarkProxy": "Fama-French market return, Mkt-RF + RF",
            "dailyTickers": ETF_TICKERS,
            "notes": [
                "Long-history series are proxy portfolios, not official S&P GICS sector indexes.",
                "Daily live layer uses XLP, XLY, and SPY ETFs as investable sector proxies.",
                "Official S&P 500 GICS sector valuation, EPS, ROE, and holdings modules are framed for later data connection.",
            ],
        },
        "monthly": monthly,
        "annual": annual,
        "daily": daily,
        "dailyAnnual": daily_annual,
        "matrix": build_matrix(annual),
        "distribution": {
            "staples": build_bins(annual, "staples"),
            "discretionary": build_bins(annual, "discretionary"),
            "market": build_bins(annual, "market"),
        },
        "summary": {
            "long": {
                "staples": summary_stats(monthly, annual, "staples", "36m"),
                "discretionary": summary_stats(monthly, annual, "discretionary", "36m"),
                "market": summary_stats(monthly, annual, "market", "36m"),
            },
            "daily": {
                "staples": summary_stats(daily, daily_annual, "staples", "252d"),
                "discretionary": summary_stats(daily, daily_annual, "discretionary", "252d"),
                "market": summary_stats(daily, daily_annual, "market", "252d"),
            },
        },
        "exposure": {
            "staples": [
                {"name": "Food", "label": "食品", "weight": 20},
                {"name": "Soda", "label": "软饮", "weight": 20},
                {"name": "Beer", "label": "酒类", "weight": 20},
                {"name": "Smoke", "label": "烟草", "weight": 20},
                {"name": "Hshld", "label": "家庭用品", "weight": 20},
            ],
            "discretionary": [
                {"name": "Toys", "label": "玩具", "weight": 14.3},
                {"name": "Fun", "label": "娱乐", "weight": 14.3},
                {"name": "Books", "label": "出版", "weight": 14.3},
                {"name": "Clths", "label": "服装", "weight": 14.3},
                {"name": "Autos", "label": "汽车", "weight": 14.3},
                {"name": "Rtail", "label": "零售", "weight": 14.3},
                {"name": "Meals", "label": "餐饮", "weight": 14.3},
            ],
        },
    }
    return dataset


def main():
    parser = argparse.ArgumentParser(description="Build Consumer Big Picture data bundle.")
    parser.add_argument("--download", action="store_true", help="Refresh all source files before building.")
    parser.add_argument("--download-ff", action="store_true", help="Refresh Fama-French monthly source files before building.")
    parser.add_argument("--download-daily", action="store_true", help="Refresh ETF daily source files before building.")
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    maybe_download(download_ff=args.download or args.download_ff, download_daily=args.download or args.download_daily)
    dataset = build_dataset()
    OUT.write_text("window.CONSUMER_DATA = " + json.dumps(dataset, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(
        f"Wrote {OUT.relative_to(ROOT)} with "
        f"{len(dataset['monthly'])} monthly rows, {len(dataset['annual'])} annual rows, "
        f"{len(dataset['daily'])} daily rows through {dataset['meta']['dailyEnd']}"
    )


if __name__ == "__main__":
    main()
