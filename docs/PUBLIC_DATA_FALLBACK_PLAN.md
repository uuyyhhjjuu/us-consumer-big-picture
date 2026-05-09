# Public Data Fallback Plan

This project can be submitted before WindPy is available by using a staged data design.

## Submission-Ready Layer

- Long history: Kenneth French Data Library, 49 Industry Portfolios, monthly data from 1926.
- Market benchmark: Fama/French market return, Mkt-RF + RF.
- Daily layer: public ETF prices for SPY, XLP, and XLY.
- Analytics already generated: price index, annual return, relative return, drawdown, volatility, return distribution, holding-period matrix.

## Fast Manual Layer

Use this when licensed APIs are blocked but a current snapshot is needed for presentation.

1. Copy `data/manual/valuation.csv.example` to `data/manual/valuation.csv`.
2. Fill latest PE, EPS, and ROE rows from Wind, Excel, index fact sheets, or another licensed source.
3. Copy `data/manual/exposure.csv.example` to `data/manual/exposure.csv`.
4. Fill latest sector or sub-industry weights.
5. Run:

```powershell
python .\scripts\build_data.py
```

The site will automatically use the CSV files if they exist.

## Later Automated Layer

- WindPy: official local licensed path once `w.start()` works.
- ETF issuer holdings: XLP / XLY holdings for constituent and weight snapshots.
- SEC 13F: institutional positioning proxy.
- Paid APIs: FactSet, Morningstar, S&P Capital IQ, Bloomberg, FMP, EODHD, Alpha Vantage, or Nasdaq Data Link if licensed.

The frontend is intentionally source-agnostic: WindPy, CSV, or future APIs can all write into the same generated `data/consumer-data.js` bundle.
