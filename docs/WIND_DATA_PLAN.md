# Wind Data Plan

正式指数口径：

- `IXIC.GI`: 纳斯达克指数
- `SPX.GI`: 标普500
- `S5COND.SPI`: 标普500可选消费
- `S5CONS.SPI`: 标普500日常消费 / 必选消费

## Local Setup

Codex 已在本机找到 WindPy：

```text
D:\Wind\Wind.NET.Client\WindNET\x64\WindPy.py
```

如果脚本提示 `WindPy start failed`，先打开 Wind 客户端并登录，确认 Wind 数据服务正常运行。

## Check Connection

```powershell
cd "E:\Codex\Vibe Coding\us-consumer-big-picture"
python .\scripts\wind_provider.py --check
```

## Fetch Official Index Prices

```powershell
python .\scripts\wind_provider.py --prices --start 1990-01-01 --end 2026-05-09 --price-fields close,pct_chg
```

输出：

```text
data/wind_index_prices.json
```

## Fetch Valuation Snapshot

```powershell
python .\scripts\wind_provider.py --snapshot --snapshot-fields pe_ttm,pb_lf,eps_ttm,roe_ttm,dividendyield2
```

输出：

```text
data/wind_index_snapshot.json
```

## Next Integration Steps

1. 用 Wind 价格序列替换网页中的 ETF daily layer。
2. 保留 XLP/XLY/SPY 作为 public fallback。
3. 用 Wind snapshot 填充 PE / EPS / ROE / PB / 股息率卡片。
4. 再接 Wind 成分股和权重数据，替换“行业暴露（百年代理篮子）”模块。

待确认的 Wind 字段：

- 成分股列表：可尝试 `w.wset` 的指数成分接口。
- 成分股权重：需要确认 Wind 对 `S5COND.SPI` / `S5CONS.SPI` 的字段或数据集名称。
- 指数财务字段：`pe_ttm`, `pb_lf`, `eps_ttm`, `roe_ttm`, `dividendyield2` 需按你账号权限实测。
