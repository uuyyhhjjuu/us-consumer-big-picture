# Last-Minute Submission Guide

Use this guide for the competition submission version.

## What is already presentation-ready

- One-screen research conclusion generated from existing data.
- Long-history price, return, relative return, drawdown, volatility, return distribution, and holding-period matrix.
- Public ETF daily layer for SPY, XLP, and XLY.
- Data readiness section explaining current public data, CSV bridge, and future Wind/API connection.
- AI workflow section explaining how a research idea becomes a reusable dashboard.

## Optional data to provide before the formal presentation

### 1. Valuation snapshot

Copy `data/manual/valuation.csv.example` to `data/manual/valuation.csv`, then fill:

- `sector`: `staples`, `discretionary`, `market`
- `label`: display name
- `pe_ttm`: latest PE TTM
- `eps_ttm`: latest EPS TTM
- `roe_ttm`: latest ROE TTM
- `source`: Wind, S&P fact sheet, ETF issuer, or internal database

Even one latest snapshot is useful for presentation.

### 2. Exposure snapshot

Copy `data/manual/exposure.csv.example` to `data/manual/exposure.csv`, then fill:

- `sector`: `staples` or `discretionary`
- `name`: sub-industry or constituent name
- `label`: Chinese display name
- `weight`: percentage weight
- `source`: Wind, ETF holdings, S&P GICS, or internal database

Top 10 holdings or sub-industry weights are enough for the first enhanced version.

## Rebuild after adding CSV

```powershell
python .\scripts\build_data.py
python -m http.server 4327
```

Then open:

```text
http://localhost:4327
```

## Competition narrative

The key message is:

> This is not only a chart page. It is an AI-assisted research product prototype that turns a vague investment question into a reusable, updateable, and extensible dashboard.
