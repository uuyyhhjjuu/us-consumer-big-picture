# Consumer Big Picture

百年尺度下的美国消费行业看板。

## What It Does

- Long-history layer: Fama-French 49 Industry Portfolios, monthly data from 1926.
- Daily market layer: XLP, XLY, and SPY ETF daily prices.
- Static frontend: no backend server is required after data is generated.
- GitHub Pages workflow: daily ETF refresh and monthly Fama-French refresh.

## Local Run

```powershell
python .\scripts\build_data.py
python -m http.server 4320
```

Open:

```text
http://localhost:4320
```

To refresh public source data locally:

```powershell
python .\scripts\build_data.py --download
```

## Cloud Deploy

Use this folder as the root of a GitHub repository, then enable GitHub Pages:

1. Push the contents of `us-consumer-big-picture` to a new GitHub repo.
2. In GitHub repo settings, open `Pages`.
3. Set source to `GitHub Actions`.
4. Run the `Update Data And Deploy Pages` workflow once from the Actions tab.

The workflow will then:

- update XLP / XLY / SPY daily prices every US trading day after market close;
- update the Fama-French long-history files monthly;
- rebuild `data/consumer-data.js`;
- deploy the static site to GitHub Pages.

## Data Boundary

The long-history consumer sector series are proxy portfolios, not official S&P GICS sector indexes. The daily layer uses investable ETF proxies:

- XLP: Consumer Staples Select Sector SPDR Fund
- XLY: Consumer Discretionary Select Sector SPDR Fund
- SPY: SPDR S&P 500 ETF Trust

PE, EPS, ROE, fund positioning, and official constituent-change modules are structured in the UI but require a later official or licensed data source connection.
