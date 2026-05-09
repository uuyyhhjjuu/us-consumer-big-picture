import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

INDEX_CODES = {
    "nasdaq": "IXIC.GI",
    "spx": "SPX.GI",
    "discretionary": "S5COND.SPI",
    "staples": "S5CONS.SPI",
}

DEFAULT_WIND_DIRS = [
    Path(r"D:\Wind\Wind.NET.Client\WindNET\x64"),
    Path(r"D:\Wind\Wind.NET.Client\WindNET\bin"),
    Path(r"C:\Wind\Wind.NET.Client\WindNET\x64"),
    Path(r"C:\Wind\Wind.NET.Client\WindNET\bin"),
]


def find_wind_dir():
    env = os.environ.get("WINDPY_DIR")
    if env and (Path(env) / "WindPy.py").exists():
        return Path(env)
    for path in DEFAULT_WIND_DIRS:
        if (path / "WindPy.py").exists():
            return path
    raise FileNotFoundError("Cannot find WindPy.py. Set WINDPY_DIR to the folder containing WindPy.py.")


def import_windpy():
    wind_dir = find_wind_dir()
    shim = ROOT / ".wind-site" / "site-packages"
    shim.mkdir(parents=True, exist_ok=True)
    (shim / "WindPy.pth").write_text(str(wind_dir), encoding="ascii")
    sys.path.insert(0, str(shim))
    sys.path.insert(0, str(wind_dir))
    from WindPy import w  # type: ignore

    return w, wind_dir


def ensure_wind_started():
    w, wind_dir = import_windpy()
    result = w.start()
    if getattr(result, "ErrorCode", None) != 0:
        raise RuntimeError(
            f"WindPy start failed: {result}. "
            "Open the Wind terminal, log in, and confirm the Wind data service is running. "
            f"WindPy path: {wind_dir}"
        )
    return w


def wind_result_to_rows(result):
    if result.ErrorCode != 0:
        raise RuntimeError(f"Wind request failed: ErrorCode={result.ErrorCode}, Data={result.Data}")
    rows = []
    codes = result.Codes or []
    fields = result.Fields or []
    times = [str(t)[:10] for t in result.Times]
    for code_idx, code in enumerate(codes):
        for time_idx, item_time in enumerate(times):
            row = {"date": item_time, "code": code}
            for field_idx, field in enumerate(fields):
                # WindPy shape: Data[field][time] for single code, or Data[field][code*time] for multi code.
                values = result.Data[field_idx]
                if len(codes) == 1:
                    value = values[time_idx]
                else:
                    value = values[code_idx * len(times) + time_idx]
                row[field.lower()] = value
            rows.append(row)
    return rows


def fetch_prices(start, end, fields):
    w = ensure_wind_started()
    try:
        codes = ",".join(INDEX_CODES.values())
        result = w.wsd(codes, fields, start, end, "")
        rows = wind_result_to_rows(result)
        return rows
    finally:
        w.close()


def fetch_snapshot(fields):
    w = ensure_wind_started()
    try:
        codes = ",".join(INDEX_CODES.values())
        result = w.wss(codes, fields, "")
        if result.ErrorCode != 0:
            raise RuntimeError(f"Wind request failed: ErrorCode={result.ErrorCode}, Data={result.Data}")
        rows = []
        for code_idx, code in enumerate(result.Codes):
            row = {"date": date.today().isoformat(), "code": code}
            for field_idx, field in enumerate(result.Fields):
                row[field.lower()] = result.Data[field_idx][code_idx]
            rows.append(row)
        return rows
    finally:
        w.close()


def write_json(name, payload):
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {path}")


def main():
    parser = argparse.ArgumentParser(description="Fetch official index data from Wind.")
    parser.add_argument("--check", action="store_true", help="Check WindPy import and Wind connection.")
    parser.add_argument("--prices", action="store_true", help="Fetch historical index price fields.")
    parser.add_argument("--snapshot", action="store_true", help="Fetch current valuation/fundamental snapshot fields.")
    parser.add_argument("--start", default="1990-01-01")
    parser.add_argument("--end", default=date.today().isoformat())
    parser.add_argument("--price-fields", default="close,pct_chg")
    parser.add_argument("--snapshot-fields", default="pe_ttm,pb_lf,eps_ttm,roe_ttm,dividendyield2")
    args = parser.parse_args()

    if args.check:
        w = ensure_wind_started()
        print("Wind connection OK")
        w.close()

    if args.prices:
        payload = {
            "source": "Wind",
            "codes": INDEX_CODES,
            "fields": args.price_fields.split(","),
            "start": args.start,
            "end": args.end,
            "rows": fetch_prices(args.start, args.end, args.price_fields),
        }
        write_json("wind_index_prices.json", payload)

    if args.snapshot:
        payload = {
            "source": "Wind",
            "codes": INDEX_CODES,
            "fields": args.snapshot_fields.split(","),
            "date": date.today().isoformat(),
            "rows": fetch_snapshot(args.snapshot_fields),
        }
        write_json("wind_index_snapshot.json", payload)

    if not (args.check or args.prices or args.snapshot):
        parser.print_help()


if __name__ == "__main__":
    main()
