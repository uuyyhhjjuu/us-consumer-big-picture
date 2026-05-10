const data = window.CONSUMER_DATA;

const labels = {
  staples: "必选消费",
  discretionary: "可选消费",
  market: "标普500代理",
};

const colors = {
  staples: "#43b36b",
  discretionary: "#d8a13d",
  market: "#111827",
};

const heroColors = {
  staples: "#f4bd4a",
  discretionary: "#4eb5ff",
  market: "#7ed957",
};

let activeAsset = "staples";
let priceMode = "log";

const ranges = {
  daily: { start: Math.max(0, data.daily.length - 756), end: data.daily.length - 1 },
  monthly: { start: 0, end: data.monthly.length - 1 },
  annual: { start: 0, end: data.annual.length - 1 },
};

const fmtPct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const fmtNum = (value, digits = 0) => Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
const fmtMaybe = (value, suffix = "", digits = 1) => Number.isFinite(value) ? `${Number(value).toFixed(digits)}${suffix}` : "--";

function $(selector) {
  return document.querySelector(selector);
}

function all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function clear(node) {
  node.innerHTML = "";
}

function mountSvg(container, viewBox = [0, 0, 1180, 460]) {
  clear(container);
  const svg = svgEl("svg", { viewBox: viewBox.join(" "), role: "img" });
  container.appendChild(svg);
  return svg;
}

function pathFor(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
}

function paddedExtent(values, pad = 0.08) {
  const clean = values.filter((v) => Number.isFinite(v));
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || Math.abs(max) || 1;
  return [min - span * pad, max + span * pad];
}

function makeScales(width, height, margin, xValues, yValues) {
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const [yMin, yMax] = paddedExtent(yValues);
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x = (v) => margin.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v) => margin.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;
  return { x, y, yMin, yMax, plotW, plotH };
}

function drawAxes(svg, width, height, margin, xLabels, yMin, yMax, yFormatter = (v) => v.toFixed(0)) {
  const plotH = height - margin.top - margin.bottom;
  const plotW = width - margin.left - margin.right;
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + (plotH * i) / 4;
    svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
    const value = yMax - ((yMax - yMin) * i) / 4;
    const text = svgEl("text", { x: margin.left - 10, y: y + 4, "text-anchor": "end", class: "axis" });
    text.textContent = yFormatter(value);
    svg.appendChild(text);
  }

  xLabels.forEach(([label, pos]) => {
    const x = margin.left + plotW * pos;
    const text = svgEl("text", { x, y: height - margin.bottom + 24, "text-anchor": "middle", class: "axis" });
    text.textContent = label;
    svg.appendChild(text);
  });
}

function drawLegend(svg, items, x, y) {
  let offset = 0;
  items.forEach((item) => {
    svg.appendChild(svgEl("line", { x1: x + offset, y1: y, x2: x + offset + 24, y2: y, stroke: item.color, "stroke-width": 3 }));
    const text = svgEl("text", { x: x + offset + 32, y: y + 4, class: "legend" });
    text.textContent = item.label;
    svg.appendChild(text);
    offset += item.label.length * 13 + 62;
  });
}

function sliceRange(items, scope) {
  return items.slice(ranges[scope].start, ranges[scope].end + 1);
}

function timeLabels(items, formatter = (x) => x.date.slice(0, 4)) {
  if (items.length < 2) return [["", 0]];
  const picks = [0, 0.25, 0.5, 0.75, 1];
  const seen = new Set();
  return picks
    .map((p) => {
      const idx = Math.min(items.length - 1, Math.round((items.length - 1) * p));
      return [formatter(items[idx]), idx / (items.length - 1)];
    })
    .filter(([label]) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function nearestIndexByDate(items, date) {
  let best = 0;
  let bestDiff = Infinity;
  const target = new Date(date).getTime();
  items.forEach((item, idx) => {
    const raw = item.date.length === 7 ? `${item.date}-15` : item.date;
    const diff = Math.abs(new Date(raw).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = idx;
    }
  });
  return best;
}

function renderHero() {
  $("#date-range").textContent = `${data.meta.longStart} 至 ${data.meta.longEnd}`;
  $("#daily-range").textContent = data.meta.dailyIsFallback ? "本地待云端更新" : data.meta.dailyEnd;
  $("#hero-staples-cagr").textContent = fmtPct(data.summary.long.staples.cagr, 2);
  $("#hero-disc-cagr").textContent = fmtPct(data.summary.long.discretionary.cagr, 2);
}

function renderHeroTrend() {
  const container = $("#hero-trend-chart");
  const svg = mountSvg(container, [0, 0, 1600, 560]);
  const months = data.monthly;
  const keys = ["market", "staples", "discretionary"];
  const margin = { left: 145, right: 40, top: 40, bottom: 70 };
  const xValues = months.map((_, i) => i);
  const yValues = keys.flatMap((key) => months.map((p) => Math.log10(p.levels[key])));
  const scales = makeScales(1600, 560, margin, xValues, yValues);

  keys.forEach((key) => {
    const points = months.map((p, i) => [scales.x(i), scales.y(Math.log10(p.levels[key]))]);
    svg.appendChild(svgEl("path", {
      d: pathFor(points),
      fill: "none",
      stroke: heroColors[key],
      "stroke-width": key === "market" ? 4 : 2.6,
      opacity: key === "market" ? 0.95 : 0.72,
    }));
  });

  const events = [
    ["1929-09-01", "1929 · 大萧条", -16, 60],
    ["1974-09-01", "1974 · 滞胀底", -78, 26],
    ["1987-10-01", "1987 · 黑色星期一", -92, 48],
    ["2000-08-01", "2000 · 互联网泡沫", -110, -44],
    ["2008-10-01", "2008 · 次贷危机", -74, 54],
    ["2020-03-01", "2020 · 疫情冲击", -170, -52],
  ];
  events.forEach(([date, label, dx, dy]) => {
    const idx = nearestIndexByDate(months, date);
    const x = scales.x(idx);
    const y = scales.y(Math.log10(months[idx].levels.market));
    svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 28, fill: "rgba(230,77,77,0.18)" }));
    svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 14, fill: "#ff5151" }));
    const text = svgEl("text", { x: x + dx, y: y + dy, class: "hero-event-label" });
    text.textContent = label;
    svg.appendChild(text);
  });

  const legend = [
    ["标普500代理", heroColors.market],
    ["必选消费", heroColors.staples],
    ["可选消费", heroColors.discretionary],
  ];
  legend.forEach(([label, color], idx) => {
    const x = 1130;
    const y = 410 + idx * 30;
    svg.appendChild(svgEl("line", { x1: x, y1: y, x2: x + 32, y2: y, stroke: color, "stroke-width": 4 }));
    const text = svgEl("text", { x: x + 44, y: y + 5, class: "hero-legend" });
    text.textContent = label;
    svg.appendChild(text);
  });
}

function renderCards() {
  const stats = data.summary.long[activeAsset];
  const market = data.summary.long.market;
  const cards = [
    ["长期年化", fmtPct(stats.cagr, 2), `标普500代理 ${fmtPct(market.cagr, 2)}`],
    ["当前回撤", fmtPct(stats.currentDrawdown, 1), `历史最大回撤 ${fmtPct(stats.maxDrawdown, 1)}`],
    ["36M 波动率", fmtPct(stats.currentVol, 1), `历史分位 ${fmtPct(stats.volPercentile, 0)}`],
    ["上涨年份占比", fmtPct(stats.positiveYears, 0), `最好年份 ${fmtPct(stats.bestYear, 0)} / 最差年份 ${fmtPct(stats.worstYear, 0)}`],
  ];
  $("#summary-cards").innerHTML = cards
    .map(([label, value, sub]) => `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`)
    .join("");
}

function periodReturn(series, key, lookback) {
  if (!series.length) return 0;
  const end = series.length - 1;
  const start = Math.max(0, end - lookback);
  return series[end].levels[key] / series[start].levels[key] - 1;
}

function drawdownLabel(value) {
  if (value >= -0.03) return "历史高位附近";
  if (value >= -0.15) return "温和回撤";
  if (value >= -0.3) return "压力区间";
  return "深度压力";
}

function temperatureLabel(percentile) {
  if (percentile >= 0.7) return "偏热";
  if (percentile <= 0.35) return "偏冷";
  return "中性";
}

function renderBrief() {
  const dailyLookback = Math.min(252, Math.max(1, data.daily.length - 1));
  const monthlyLookback = Math.min(12, Math.max(1, data.monthly.length - 1));
  const recentSource = data.meta.dailyIsFallback ? data.monthly : data.daily;
  const lookback = data.meta.dailyIsFallback ? monthlyLookback : dailyLookback;
  const recent = {
    staples: periodReturn(recentSource, "staples", lookback),
    discretionary: periodReturn(recentSource, "discretionary", lookback),
    market: periodReturn(recentSource, "market", lookback),
  };
  const leader = recent.staples >= recent.discretionary ? "必选消费" : "可选消费";
  const activeStats = data.summary.long[activeAsset];
  const longGap = data.summary.long.staples.cagr - data.summary.long.discretionary.cagr;
  const activeRecentExcess = recent[activeAsset] - recent.market;
  const activeDrawdown = activeStats.currentDrawdown;
  const activeTemperature = temperatureLabel(activeStats.volPercentile || 0);
  const cards = [
    ["当前阶段", drawdownLabel(activeDrawdown), `${labels[activeAsset]}当前回撤 ${fmtPct(activeDrawdown, 1)}`],
    ["近12月主线", leader, `必选 ${fmtPct(recent.staples, 1)} / 可选 ${fmtPct(recent.discretionary, 1)} / 市场 ${fmtPct(recent.market, 1)}`],
    ["相对市场", fmtPct(activeRecentExcess, 1), `${labels[activeAsset]}近12月相对标普500代理`],
    ["风险温度", activeTemperature, `36M 波动率历史分位 ${fmtPct(activeStats.volPercentile || 0, 0)}`],
  ];

  $("#brief-grid").innerHTML = cards
    .map(([label, value, sub]) => `<article class="brief-card"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`)
    .join("");

  $("#brief-narrative").innerHTML = `
    <strong>答辩口径：</strong>
    <span>百年维度看，必选消费长期年化较可选消费高 ${fmtPct(longGap, 2)}，但不同周期的相对强弱会显著切换；当前可先用 ${leader} 作为近一年主线观察对象。</span>
    <span>${labels[activeAsset]}现在处于“${drawdownLabel(activeDrawdown)}”，波动温度为“${activeTemperature}”，适合继续用下方回撤、相对收益和波动图验证风险收益位置。</span>
    <span>估值、盈利和真实权重已经预留 CSV/Wind 接口，赛前只要补入最新快照，就能从“历史位置”延伸到“市场贵不贵、盈利是否支撑”。</span>
  `;
}

function renderLiveCards() {
  const latest = data.daily[data.daily.length - 1];
  const cards = ["staples", "discretionary", "market"].map((key) => {
    const stats = data.summary.daily[key];
    const price = latest.price[key] ? `$${fmtNum(latest.price[key], 2)}` : "待云端更新";
    const detail = data.meta.dailyIsFallback
      ? "本地未拉取 ETF 日频；云端工作流成功后自动填充"
      : `当前回撤 ${fmtPct(stats.currentDrawdown, 1)} · 252D 波动 ${fmtPct(stats.currentVol, 1)} · 更新 ${stats.lastDate}`;
    return `<article class="live-card"><span>${labels[key]} · ${data.meta.dailyTickers[key].toUpperCase()}</span><strong>${price}</strong><small>${detail}</small></article>`;
  });
  $("#live-cards").innerHTML = cards.join("");
}

function renderDailyChart() {
  const container = $("#daily-chart");
  const svg = mountSvg(container);
  const width = 1180;
  const height = 460;
  if (data.meta.dailyIsFallback) {
    const text = svgEl("text", { x: width / 2, y: height / 2 - 10, "text-anchor": "middle", class: "legend" });
    text.textContent = "本地尚未下载 ETF 日频数据；云端工作流运行后将显示 XLP / XLY / SPY 走势";
    svg.appendChild(text);
    return;
  }
  const margin = { top: 46, right: 36, bottom: 54, left: 70 };
  const daily = sliceRange(data.daily, "daily");
  const keys = ["staples", "discretionary", "market"];
  const xValues = daily.map((_, i) => i);
  const yValues = keys.flatMap((key) => daily.map((p) => (p.levels[key] / daily[0].levels[key]) * 100));
  const scales = makeScales(width, height, margin, xValues, yValues);
  drawAxes(svg, width, height, margin, timeLabels(daily, (p) => p.date.slice(0, 7)), scales.yMin, scales.yMax, (v) => fmtNum(v, 0));
  keys.forEach((key) => {
    const base = daily[0].levels[key];
    const points = daily.map((p, i) => [scales.x(i), scales.y((p.levels[key] / base) * 100)]);
    svg.appendChild(svgEl("path", { d: pathFor(points), fill: "none", stroke: colors[key], "stroke-width": key === activeAsset ? 3 : 1.9, opacity: key === activeAsset ? 1 : 0.78 }));
  });
  drawLegend(svg, keys.map((key) => ({ label: `${labels[key]} ${data.meta.dailyTickers[key].toUpperCase()}`, color: colors[key] })), 395, 28);
}

function renderPriceChart() {
  const container = $("#price-chart");
  const svg = mountSvg(container, [0, 0, 1180, 560]);
  const width = 1180;
  const height = 560;
  const margin = { top: 46, right: 34, bottom: 54, left: 70 };
  const months = sliceRange(data.monthly, "monthly");
  const keys = ["staples", "discretionary", "market"];
  const xValues = months.map((_, i) => i);
  const series = {};
  keys.forEach((key) => {
    const base = months[0].levels[key];
    series[key] = months.map((p) => {
      const value = p.levels[key];
      if (priceMode === "log") return Math.log10(value);
      if (priceMode === "percent") return value / base - 1;
      return value;
    });
  });
  const yValues = keys.flatMap((key) => series[key]);
  const scales = makeScales(width, height, margin, xValues, yValues);
  drawAxes(svg, width, height, margin, timeLabels(months), scales.yMin, scales.yMax, (v) => {
    if (priceMode === "log") return fmtNum(10 ** v, 0);
    if (priceMode === "percent") return fmtPct(v, 0);
    return fmtNum(v, 0);
  });
  keys.forEach((key) => {
    const points = series[key].map((v, i) => [scales.x(i), scales.y(v)]);
    svg.appendChild(svgEl("path", { d: pathFor(points), fill: "none", stroke: colors[key], "stroke-width": key === activeAsset ? 3 : 1.9, opacity: key === activeAsset ? 1 : 0.78 }));
  });
  drawLegend(svg, keys.map((key) => ({ label: labels[key], color: colors[key] })), 455, 28);
}

function renderRelativeChart() {
  const container = $("#relative-chart");
  const svg = mountSvg(container);
  const width = 1180;
  const height = 460;
  const margin = { top: 46, right: 36, bottom: 54, left: 70 };
  const months = sliceRange(data.monthly, "monthly");
  const relKeys = [
    ["staples", "必选 / 标普500代理", colors.staples],
    ["discretionary", "可选 / 标普500代理", "#d8a13d"],
    ["staplesVsDiscretionary", "必选 / 可选", "#3157d5"],
  ];
  const xValues = months.map((_, i) => i);
  const yValues = relKeys.flatMap(([key]) => {
    const base = months[0].relative[key];
    return months.map((p) => Math.log10(p.relative[key] / base * 100));
  });
  const scales = makeScales(width, height, margin, xValues, yValues);
  drawAxes(svg, width, height, margin, timeLabels(months), scales.yMin, scales.yMax, (v) => fmtNum(10 ** v, 1));
  relKeys.forEach(([key, , color]) => {
    const base = months[0].relative[key];
    const points = months.map((p, i) => [scales.x(i), scales.y(Math.log10(p.relative[key] / base * 100))]);
    svg.appendChild(svgEl("path", { d: pathFor(points), fill: "none", stroke: color, "stroke-width": 2.4 }));
  });
  drawLegend(svg, relKeys.map(([, label, color]) => ({ label, color })), 320, 28);
}

function renderAnnualChart() {
  const container = $("#annual-chart");
  const svg = mountSvg(container);
  const width = 1180;
  const height = 460;
  const margin = { top: 36, right: 30, bottom: 58, left: 62 };
  const annual = sliceRange(data.annual, "annual");
  const values = annual.map((r) => r[activeAsset]);
  const [yMin, yMax] = paddedExtent([...values, 0], 0.05);
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x = (i) => margin.left + (i / annual.length) * plotW;
  const y = (v) => margin.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;
  const zero = y(0);
  drawAxes(svg, width, height, margin, timeLabels(annual, (p) => String(p.year)), yMin, yMax, (v) => fmtPct(v, 0));
  svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: zero, y2: zero, stroke: "#9ca3af", "stroke-width": 1 }));
  const barW = Math.max(2, plotW / annual.length - 1);
  annual.forEach((row, i) => {
    const value = row[activeAsset];
    const top = Math.min(y(value), zero);
    const h = Math.abs(y(value) - zero);
    svg.appendChild(svgEl("rect", { x: x(i), y: top, width: barW, height: Math.max(1, h), fill: value >= 0 ? colors[activeAsset] : "#c2413b", opacity: 0.86 }));
  });
}

function renderDistributionChart() {
  const container = $("#distribution-chart");
  const svg = mountSvg(container, [0, 0, 1180, 340]);
  const width = 1180;
  const height = 340;
  const margin = { top: 30, right: 34, bottom: 70, left: 56 };
  const annual = sliceRange(data.annual, "annual");
  const rows = buildBins(annual, activeAsset);
  const max = Math.max(...rows.map((r) => r.count), 1);
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const barW = plotW / rows.length - 18;
  rows.forEach((row, i) => {
    const x = margin.left + i * (plotW / rows.length) + 9;
    const h = (row.count / max) * plotH;
    const y = margin.top + plotH - h;
    svg.appendChild(svgEl("rect", { x, y, width: barW, height: h, fill: row.label.includes("-") || row.label.startsWith("<") ? "#c2413b" : colors[activeAsset], opacity: 0.86 }));
    const label = svgEl("text", { x: x + barW / 2, y: height - margin.bottom + 24, "text-anchor": "middle", class: "axis" });
    label.textContent = row.label;
    svg.appendChild(label);
    const count = svgEl("text", { x: x + barW / 2, y: y - 8, "text-anchor": "middle", class: "axis" });
    count.textContent = row.count;
    svg.appendChild(count);
  });
}

function buildBins(annual, key) {
  const bins = [
    [-1, -0.3, "< -30%"],
    [-0.3, -0.2, "-30%~-20%"],
    [-0.2, -0.1, "-20%~-10%"],
    [-0.1, 0, "-10%~0%"],
    [0, 0.1, "0%~10%"],
    [0.1, 0.2, "10%~20%"],
    [0.2, 0.3, "20%~30%"],
    [0.3, 0.5, "30%~50%"],
    [0.5, 10, "> 50%"],
  ];
  return bins.map(([lo, hi, label]) => ({ label, count: annual.filter((row) => lo <= row[key] && row[key] < hi).length }));
}

function renderMatrix() {
  const container = $("#matrix-chart");
  clear(container);
  const annual = sliceRange(data.annual, "annual");
  const years = annual.map((row) => row.year);
  const cell = Math.max(8, Math.min(14, Math.floor(960 / years.length)));
  const left = 54;
  const top = 34;
  const width = left + years.length * cell + 20;
  const height = top + years.length * cell + 24;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, style: `width:${width}px;height:${height}px` });
  container.appendChild(svg);
  years.forEach((year, i) => {
    if (year % 10 === 0 || i === 0 || i === years.length - 1) {
      const tx = svgEl("text", { x: left + i * cell + cell / 2, y: 22, "text-anchor": "middle", class: "axis" });
      tx.textContent = year;
      svg.appendChild(tx);
      const ty = svgEl("text", { x: 44, y: top + i * cell + 10, "text-anchor": "end", class: "axis" });
      ty.textContent = year;
      svg.appendChild(ty);
    }
  });
  annual.forEach((startRow, yIdx) => {
    let value = 1;
    annual.forEach((endRow, xIdx) => {
      if (xIdx < yIdx) return;
      value *= 1 + endRow[activeAsset];
      const yearsHeld = xIdx - yIdx + 1;
      const annualized = value ** (1 / yearsHeld) - 1;
      svg.appendChild(svgEl("rect", { x: left + xIdx * cell, y: top + yIdx * cell, width: cell, height: cell, fill: heatColor(annualized) }));
    });
  });
}

function heatColor(value) {
  const clamped = Math.max(-0.25, Math.min(0.25, value));
  if (clamped >= 0) return mix("#f8fafc", "#0f8a5f", clamped / 0.25);
  return mix("#f8fafc", "#c2413b", Math.abs(clamped) / 0.25);
}

function mix(a, b, t) {
  const ah = a.replace("#", "");
  const bh = b.replace("#", "");
  const ar = parseInt(ah.slice(0, 2), 16);
  const ag = parseInt(ah.slice(2, 4), 16);
  const ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16);
  const bg = parseInt(bh.slice(2, 4), 16);
  const bb = parseInt(bh.slice(4, 6), 16);
  const rr = Math.round(ar + (br - ar) * t).toString(16).padStart(2, "0");
  const rg = Math.round(ag + (bg - ag) * t).toString(16).padStart(2, "0");
  const rb = Math.round(ab + (bb - ab) * t).toString(16).padStart(2, "0");
  return `#${rr}${rg}${rb}`;
}

function renderDrawdownChart() {
  const container = $("#drawdown-chart");
  const svg = mountSvg(container);
  const width = 1180;
  const height = 460;
  const margin = { top: 44, right: 34, bottom: 54, left: 70 };
  const months = sliceRange(data.monthly, "monthly");
  const keys = ["staples", "discretionary", "market"];
  const xValues = months.map((_, i) => i);
  const yValues = keys.flatMap((key) => months.map((p) => p.drawdown[key])).concat([0]);
  const scales = makeScales(width, height, margin, xValues, yValues);
  scales.yMax = 0;
  scales.y = (v) => margin.top + (1 - (v - scales.yMin) / (scales.yMax - scales.yMin || 1)) * scales.plotH;
  drawAxes(svg, width, height, margin, timeLabels(months), scales.yMin, scales.yMax, (v) => fmtPct(v, 0));
  keys.forEach((key) => {
    const points = months.map((p, i) => [scales.x(i), scales.y(p.drawdown[key])]);
    svg.appendChild(svgEl("path", { d: pathFor(points), fill: "none", stroke: colors[key], "stroke-width": key === activeAsset ? 2.8 : 1.6, opacity: key === activeAsset ? 1 : 0.7 }));
  });
  drawLegend(svg, keys.map((key) => ({ label: labels[key], color: colors[key] })), 455, 28);
}

function renderVolatilityChart() {
  const container = $("#volatility-chart");
  const svg = mountSvg(container);
  const width = 1180;
  const height = 460;
  const margin = { top: 44, right: 34, bottom: 54, left: 70 };
  const months = sliceRange(data.monthly, "monthly").filter((p) => p.volatility[`${activeAsset}36m`]);
  const xValues = months.map((_, i) => i);
  const s12 = months.map((p) => p.volatility[`${activeAsset}12m`]);
  const s36 = months.map((p) => p.volatility[`${activeAsset}36m`]);
  const scales = makeScales(width, height, margin, xValues, [...s12, ...s36, 0]);
  scales.yMin = 0;
  scales.y = (v) => margin.top + (1 - (v - scales.yMin) / (scales.yMax - scales.yMin || 1)) * scales.plotH;
  drawAxes(svg, width, height, margin, timeLabels(months), scales.yMin, scales.yMax, (v) => fmtPct(v, 0));
  [
    [s12, "12M 波动率", colors[activeAsset]],
    [s36, "36M 波动率", "#3157d5"],
  ].forEach(([series, , color]) => {
    const points = series.map((v, i) => [scales.x(i), scales.y(v)]);
    svg.appendChild(svgEl("path", { d: pathFor(points), fill: "none", stroke: color, "stroke-width": 2.4 }));
  });
  drawLegend(svg, [{ label: "12M 波动率", color: colors[activeAsset] }, { label: "36M 波动率", color: "#3157d5" }], 455, 28);
}

function renderExposure() {
  renderExposureList("#staples-exposure", data.exposure.staples);
  renderExposureList("#disc-exposure", data.exposure.discretionary);
}

function renderDataReadiness() {
  const statusText = {
    connected: "已接入",
    csv_ready: "CSV 就绪",
    proxy: "代理口径",
    not_connected: "待接入",
  };
  $("#data-readiness").innerHTML = data.meta.dataReadiness
    .map((item) => `
      <article class="status-card ${item.status}">
        <span>${statusText[item.status] || item.status}</span>
        <strong>${item.name}</strong>
        <small>${item.source}</small>
        <em>${item.cadence}</em>
      </article>
    `)
    .join("");
}

function renderValuation() {
  const rows = data.valuation?.rows || [];
  const latestBySector = {};
  rows.forEach((row) => {
    if (!latestBySector[row.sector] || row.date > latestBySector[row.sector].date) {
      latestBySector[row.sector] = row;
    }
  });

  if (Object.keys(latestBySector).length) {
    $("#valuation-modules").innerHTML = ["staples", "discretionary", "market"]
      .map((key) => {
        const row = latestBySector[key];
        if (!row) {
          return `<article class="data-module"><em class="data-status">CSV 未提供</em><span>${labels[key]}</span><strong>--</strong><p>可在 data/manual/valuation.csv 中补充该口径。</p></article>`;
        }
        return `
          <article class="data-module connected">
            <em class="data-status">已从 CSV 接入</em>
            <span>${row.label || labels[key]}</span>
            <strong>PE ${fmtMaybe(row.peTtm, "x", 1)}</strong>
            <p>EPS TTM ${fmtMaybe(row.epsTtm, "", 2)} · ROE TTM ${fmtMaybe(row.roeTtm, "%", 1)} · ${row.date || "未标日期"} · ${row.source}</p>
          </article>
        `;
      })
      .join("");
    return;
  }

  $("#valuation-modules").innerHTML = `
    <article class="data-module">
      <em class="data-status">CSV 入口已预留</em>
      <span>PE</span>
      <strong>估值冷热</strong>
      <p>把 Wind、Excel 或付费 API 导出的 pe_ttm 放入 data/manual/valuation.csv 后，本模块会自动显示最新 PE。</p>
    </article>
    <article class="data-module">
      <em class="data-status">CSV 入口已预留</em>
      <span>EPS</span>
      <strong>盈利支撑</strong>
      <p>把 eps_ttm 放入同一张 CSV 后，可作为赛前增强版的盈利趋势入口，后续再升级为时间序列图。</p>
    </article>
    <article class="data-module">
      <em class="data-status">CSV 入口已预留</em>
      <span>ROE</span>
      <strong>盈利质量</strong>
      <p>把 roe_ttm 放入 CSV 后，可快速比较必选、可选与市场基准的资本回报差异。</p>
    </article>
  `;
}

function renderExposureList(selector, rows) {
  $(selector).innerHTML = rows
    .map((row) => `<div class="bar-row"><span>${row.label}</span><div class="bar-track"><div class="bar-fill" style="width:${row.weight}%"></div></div><strong>${row.weight.toFixed(1)}%</strong></div>`)
    .join("");
}

function renderRangeControl(id, scope, label) {
  const container = $(`#${id}`);
  const source = scope === "daily" ? data.daily : scope === "monthly" ? data.monthly : data.annual;
  const state = ranges[scope];
  const max = source.length - 1;
  const startValue = valueForInput(source[state.start], scope);
  const endValue = valueForInput(source[state.end], scope);
  const inputType = scope === "daily" ? "date" : scope === "monthly" ? "month" : "number";
  container.innerHTML = `
    <div class="range-row">
      <label>拖拽起点
        <input data-role="start-range" type="range" min="0" max="${max}" value="${state.start}">
      </label>
      <label>拖拽终点
        <input data-role="end-range" type="range" min="0" max="${max}" value="${state.end}">
      </label>
      <label>起点
        <input data-role="start-input" type="${inputType}" value="${startValue}" ${scope === "annual" ? `min="${source[0].year}" max="${source[max].year}"` : ""}>
      </label>
      <label>终点
        <input data-role="end-input" type="${inputType}" value="${endValue}" ${scope === "annual" ? `min="${source[0].year}" max="${source[max].year}"` : ""}>
      </label>
      <button data-role="reset">全部</button>
    </div>
    <div class="range-caption">${label}：${displayDate(source[state.start], scope)} 至 ${displayDate(source[state.end], scope)}</div>
  `;

  container.querySelector('[data-role="start-range"]').addEventListener("input", (event) => updateRange(scope, Number(event.target.value), state.end));
  container.querySelector('[data-role="end-range"]').addEventListener("input", (event) => updateRange(scope, state.start, Number(event.target.value)));
  container.querySelector('[data-role="start-input"]').addEventListener("change", (event) => updateRange(scope, indexForInput(source, scope, event.target.value), state.end));
  container.querySelector('[data-role="end-input"]').addEventListener("change", (event) => updateRange(scope, state.start, indexForInput(source, scope, event.target.value)));
  container.querySelector('[data-role="reset"]').addEventListener("click", () => updateRange(scope, 0, max));
}

function valueForInput(point, scope) {
  if (scope === "annual") return point.year;
  return point.date;
}

function displayDate(point, scope) {
  if (scope === "annual") return point.year;
  return point.date;
}

function indexForInput(source, scope, value) {
  if (scope === "annual") {
    const year = Number(value);
    return nearestBy(source, (p) => p.year, year);
  }
  return nearestIndexByDate(source, scope === "monthly" && value.length === 7 ? `${value}-15` : value);
}

function nearestBy(source, getter, target) {
  let best = 0;
  let diff = Infinity;
  source.forEach((item, idx) => {
    const d = Math.abs(getter(item) - target);
    if (d < diff) {
      diff = d;
      best = idx;
    }
  });
  return best;
}

function updateRange(scope, start, end) {
  const source = scope === "daily" ? data.daily : scope === "monthly" ? data.monthly : data.annual;
  const max = source.length - 1;
  let nextStart = Math.max(0, Math.min(max, start));
  let nextEnd = Math.max(0, Math.min(max, end));
  if (nextStart > nextEnd) [nextStart, nextEnd] = [nextEnd, nextStart];
  if (nextEnd - nextStart < 2) nextEnd = Math.min(max, nextStart + 2);
  ranges[scope] = { start: nextStart, end: nextEnd };
  renderChartsForScope(scope);
  renderRangeControls();
}

function renderRangeControls() {
  renderRangeControl("daily-range-control", "daily", "每日 ETF 价格区间");
  renderRangeControl("monthly-range-control-price", "monthly", "百年月度区间");
  renderRangeControl("monthly-range-control-relative", "monthly", "百年月度区间");
  renderRangeControl("monthly-range-control-drawdown", "monthly", "百年月度区间");
  renderRangeControl("monthly-range-control-volatility", "monthly", "百年月度区间");
  renderRangeControl("annual-range-control-return", "annual", "年度回报区间");
  renderRangeControl("annual-range-control-distribution", "annual", "年度回报区间");
  renderRangeControl("annual-range-control-matrix", "annual", "年化矩阵区间");
}

function renderChartsForScope(scope) {
  if (scope === "daily") renderDailyChart();
  if (scope === "monthly") {
    renderPriceChart();
    renderRelativeChart();
    renderDrawdownChart();
    renderVolatilityChart();
  }
  if (scope === "annual") {
    renderAnnualChart();
    renderDistributionChart();
    renderMatrix();
  }
}

function renderAll() {
  renderHero();
  renderHeroTrend();
  renderCards();
  renderBrief();
  renderLiveCards();
  renderDailyChart();
  renderPriceChart();
  renderRelativeChart();
  renderAnnualChart();
  renderDistributionChart();
  renderMatrix();
  renderDrawdownChart();
  renderVolatilityChart();
  renderDataReadiness();
  renderValuation();
  renderExposure();
  renderRangeControls();
}

all("[data-asset]").forEach((button) => {
  button.addEventListener("click", () => {
    activeAsset = button.dataset.asset;
    all("[data-asset]").forEach((b) => b.classList.toggle("active", b === button));
    renderCards();
    renderBrief();
    renderDailyChart();
    renderPriceChart();
    renderAnnualChart();
    renderDistributionChart();
    renderMatrix();
    renderDrawdownChart();
    renderVolatilityChart();
  });
});

all("[data-price-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    priceMode = button.dataset.priceMode;
    all("[data-price-mode]").forEach((b) => b.classList.toggle("active", b === button));
    renderPriceChart();
  });
});

renderAll();
