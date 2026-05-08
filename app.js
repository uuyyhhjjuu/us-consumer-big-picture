const data = window.CONSUMER_DATA;

const labels = {
  staples: "必选消费",
  discretionary: "可选消费",
  market: "美国市场",
};

const colors = {
  staples: "#0f8a5f",
  discretionary: "#b47b1f",
  market: "#111827",
};

let activeAsset = "staples";
let priceMode = "log";

const fmtPct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const fmtNum = (value, digits = 0) => Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });

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

function extent(values) {
  return [Math.min(...values), Math.max(...values)];
}

function paddedExtent(values, pad = 0.08) {
  const [min, max] = extent(values);
  const span = max - min || Math.abs(max) || 1;
  return [min - span * pad, max + span * pad];
}

function pathFor(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
}

function clear(node) {
  node.innerHTML = "";
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

function mountSvg(container, viewBox = [0, 0, 1180, 460]) {
  clear(container);
  const svg = svgEl("svg", { viewBox: viewBox.join(" "), role: "img" });
  container.appendChild(svg);
  return svg;
}

function renderHero() {
  $("#date-range").textContent = `${data.meta.longStart} 至 ${data.meta.longEnd}`;
  $("#daily-range").textContent = data.meta.dailyIsFallback ? "本地待云端更新" : data.meta.dailyEnd;
  $("#hero-staples-cagr").textContent = fmtPct(data.summary.long.staples.cagr, 2);
  $("#hero-disc-cagr").textContent = fmtPct(data.summary.long.discretionary.cagr, 2);
}

function renderCards() {
  const stats = data.summary.long[activeAsset];
  const market = data.summary.long.market;
  const cards = [
    ["长期年化", fmtPct(stats.cagr, 2), `美国市场代理 ${fmtPct(market.cagr, 2)}`],
    ["当前回撤", fmtPct(stats.currentDrawdown, 1), `历史最大回撤 ${fmtPct(stats.maxDrawdown, 1)}`],
    ["36M 波动率", fmtPct(stats.currentVol, 1), `历史分位 ${fmtPct(stats.volPercentile, 0)}`],
    ["上涨年份占比", fmtPct(stats.positiveYears, 0), `最好年份 ${fmtPct(stats.bestYear, 0)} / 最差年份 ${fmtPct(stats.worstYear, 0)}`],
  ];
  $("#summary-cards").innerHTML = cards
    .map(([label, value, sub]) => `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`)
    .join("");
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

function renderPriceChart() {
  const container = $("#price-chart");
  const svg = mountSvg(container, [0, 0, 1180, 560]);
  const width = 1180;
  const height = 560;
  const margin = { top: 46, right: 34, bottom: 54, left: 70 };
  const months = data.monthly;
  const keys = ["staples", "discretionary", "market"];
  const xValues = months.map((_, i) => i);
  const series = {};
  keys.forEach((key) => {
    series[key] = months.map((p) => {
      const value = p.levels[key];
      if (priceMode === "log") return Math.log10(value);
      if (priceMode === "percent") return value / 100 - 1;
      return value;
    });
  });
  const yValues = keys.flatMap((key) => series[key]);
  const scales = makeScales(width, height, margin, xValues, yValues);
  drawAxes(
    svg,
    width,
    height,
    margin,
    decadeLabels(months),
    scales.yMin,
    scales.yMax,
    (v) => {
      if (priceMode === "log") return fmtNum(10 ** v, 0);
      if (priceMode === "percent") return fmtPct(v, 0);
      return fmtNum(v, 0);
    },
  );
  keys.forEach((key) => {
    const points = series[key].map((v, i) => [scales.x(i), scales.y(v)]);
    svg.appendChild(svgEl("path", { d: pathFor(points), fill: "none", stroke: colors[key], "stroke-width": key === activeAsset ? 3 : 1.9, opacity: key === activeAsset ? 1 : 0.78 }));
  });
  drawLegend(svg, keys.map((key) => ({ label: labels[key], color: colors[key] })), 455, 28);
}

function decadeLabels(months) {
  const years = months.map((p) => Number(p.date.slice(0, 4)));
  const first = years[0];
  const last = years[years.length - 1];
  const targets = [];
  for (let y = Math.ceil(first / 20) * 20; y <= last; y += 20) targets.push(y);
  return targets.map((year) => {
    const idx = years.findIndex((y) => y >= year);
    return [String(year), idx / (months.length - 1)];
  });
}

function renderRelativeChart() {
  const container = $("#relative-chart");
  const svg = mountSvg(container);
  const width = 1180;
  const height = 460;
  const margin = { top: 46, right: 36, bottom: 54, left: 70 };
  const months = data.monthly;
  const relKeys = [
    ["staples", "必选 / 市场", colors.staples],
    ["discretionary", "可选 / 市场", colors.discretionary],
    ["staplesVsDiscretionary", "必选 / 可选", "#3157d5"],
  ];
  const xValues = months.map((_, i) => i);
  const yValues = relKeys.flatMap(([key]) => months.map((p) => Math.log10(p.relative[key])));
  const scales = makeScales(width, height, margin, xValues, yValues);
  drawAxes(svg, width, height, margin, decadeLabels(months), scales.yMin, scales.yMax, (v) => fmtNum(10 ** v, 1));
  relKeys.forEach(([key, , color]) => {
    const points = months.map((p, i) => [scales.x(i), scales.y(Math.log10(p.relative[key]))]);
    svg.appendChild(svgEl("path", { d: pathFor(points), fill: "none", stroke: color, "stroke-width": 2.4 }));
  });
  drawLegend(svg, relKeys.map(([, label, color]) => ({ label, color })), 410, 28);
}

function renderDailyChart() {
  const container = $("#daily-chart");
  const svg = mountSvg(container);
  const width = 1180;
  const height = 460;
  if (data.meta.dailyIsFallback) {
    const text = svgEl("text", { x: width / 2, y: height / 2 - 10, "text-anchor": "middle", class: "legend" });
    text.textContent = "本地尚未下载 ETF 日频数据；云端工作流运行后将显示 XLP / XLY / SPY 近三年走势";
    svg.appendChild(text);
    const sub = svgEl("text", { x: width / 2, y: height / 2 + 18, "text-anchor": "middle", class: "legend" });
    sub.textContent = "可在本地执行：python scripts/build_data.py --download-daily";
    svg.appendChild(sub);
    return;
  }
  const margin = { top: 46, right: 36, bottom: 54, left: 70 };
  const daily = data.daily.slice(-756);
  const keys = ["staples", "discretionary", "market"];
  const xValues = daily.map((_, i) => i);
  const yValues = keys.flatMap((key) => daily.map((p) => p.levels[key] / daily[0].levels[key] * 100));
  const scales = makeScales(width, height, margin, xValues, yValues);
  const xLabels = [
    [daily[0].date.slice(0, 4), 0],
    [daily[Math.floor(daily.length / 2)].date.slice(0, 4), 0.5],
    [daily[daily.length - 1].date, 1],
  ];
  drawAxes(svg, width, height, margin, xLabels, scales.yMin, scales.yMax, (v) => fmtNum(v, 0));
  keys.forEach((key) => {
    const base = daily[0].levels[key];
    const points = daily.map((p, i) => [scales.x(i), scales.y((p.levels[key] / base) * 100)]);
    svg.appendChild(svgEl("path", { d: pathFor(points), fill: "none", stroke: colors[key], "stroke-width": key === activeAsset ? 3 : 1.9, opacity: key === activeAsset ? 1 : 0.78 }));
  });
  drawLegend(svg, keys.map((key) => ({ label: `${labels[key]} ${data.meta.dailyTickers[key].toUpperCase()}`, color: colors[key] })), 395, 28);
}

function renderAnnualChart() {
  const container = $("#annual-chart");
  const svg = mountSvg(container);
  const width = 1180;
  const height = 460;
  const margin = { top: 36, right: 30, bottom: 58, left: 62 };
  const annual = data.annual;
  const values = annual.map((r) => r[activeAsset]);
  const [yMin, yMax] = paddedExtent([...values, 0], 0.05);
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x = (i) => margin.left + (i / annual.length) * plotW;
  const y = (v) => margin.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const zero = y(0);
  drawAxes(svg, width, height, margin, yearLabels(annual), yMin, yMax, (v) => fmtPct(v, 0));
  svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: zero, y2: zero, stroke: "#9ca3af", "stroke-width": 1 }));
  const barW = Math.max(2, plotW / annual.length - 1);
  annual.forEach((row, i) => {
    const value = row[activeAsset];
    const top = Math.min(y(value), zero);
    const h = Math.abs(y(value) - zero);
    svg.appendChild(svgEl("rect", { x: x(i), y: top, width: barW, height: Math.max(1, h), fill: value >= 0 ? colors[activeAsset] : "#c2413b", opacity: 0.86 }));
  });
}

function yearLabels(annual) {
  const first = annual[0].year;
  const last = annual[annual.length - 1].year;
  const targets = [];
  for (let y = Math.ceil(first / 20) * 20; y <= last; y += 20) targets.push(y);
  return targets.map((year) => {
    const idx = annual.findIndex((r) => r.year >= year);
    return [String(year), idx / (annual.length - 1)];
  });
}

function renderDistributionChart() {
  const container = $("#distribution-chart");
  const svg = mountSvg(container, [0, 0, 1180, 340]);
  const width = 1180;
  const height = 340;
  const margin = { top: 30, right: 34, bottom: 70, left: 56 };
  const rows = data.distribution[activeAsset];
  const max = Math.max(...rows.map((r) => r.count));
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

function renderMatrix() {
  const container = $("#matrix-chart");
  clear(container);
  const years = data.matrix.years;
  const matrix = data.matrix.matrices[activeAsset];
  const cell = 13;
  const left = 54;
  const top = 34;
  const width = left + years.length * cell + 20;
  const height = top + years.length * cell + 24;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, style: `width:${width}px;height:${height}px` });
  container.appendChild(svg);
  years.forEach((year, i) => {
    if (year % 10 === 0) {
      const tx = svgEl("text", { x: left + i * cell + cell / 2, y: 22, "text-anchor": "middle", class: "axis" });
      tx.textContent = year;
      svg.appendChild(tx);
      const ty = svgEl("text", { x: 44, y: top + i * cell + 10, "text-anchor": "end", class: "axis" });
      ty.textContent = year;
      svg.appendChild(ty);
    }
  });
  matrix.forEach((row, yIdx) => {
    row.forEach((value, xIdx) => {
      if (value === null) return;
      const fill = heatColor(value);
      svg.appendChild(svgEl("rect", { x: left + xIdx * cell, y: top + yIdx * cell, width: cell, height: cell, fill }));
    });
  });
}

function heatColor(value) {
  const clamped = Math.max(-0.25, Math.min(0.25, value));
  if (clamped >= 0) {
    const t = clamped / 0.25;
    return mix("#f8fafc", "#0f8a5f", t);
  }
  const t = Math.abs(clamped) / 0.25;
  return mix("#f8fafc", "#c2413b", t);
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
  const months = data.monthly;
  const keys = ["staples", "discretionary", "market"];
  const xValues = months.map((_, i) => i);
  const yValues = keys.flatMap((key) => months.map((p) => p.drawdown[key])).concat([0]);
  const scales = makeScales(width, height, margin, xValues, yValues);
  scales.yMax = 0;
  scales.y = (v) => margin.top + (1 - (v - scales.yMin) / (scales.yMax - scales.yMin || 1)) * scales.plotH;
  drawAxes(svg, width, height, margin, decadeLabels(months), scales.yMin, scales.yMax, (v) => fmtPct(v, 0));
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
  const months = data.monthly.filter((p) => p.volatility[`${activeAsset}36m`]);
  const xValues = months.map((_, i) => i);
  const s12 = months.map((p) => p.volatility[`${activeAsset}12m`]);
  const s36 = months.map((p) => p.volatility[`${activeAsset}36m`]);
  const scales = makeScales(width, height, margin, xValues, [...s12, ...s36, 0]);
  scales.yMin = 0;
  scales.y = (v) => margin.top + (1 - (v - scales.yMin) / (scales.yMax - scales.yMin || 1)) * scales.plotH;
  drawAxes(svg, width, height, margin, decadeLabels(months), scales.yMin, scales.yMax, (v) => fmtPct(v, 0));
  [
    [s12, "12M", colors[activeAsset]],
    [s36, "36M", "#3157d5"],
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

function renderExposureList(selector, rows) {
  $(selector).innerHTML = rows
    .map(
      (row) => `<div class="bar-row"><span>${row.label}</span><div class="bar-track"><div class="bar-fill" style="width:${row.weight}%"></div></div><strong>${row.weight.toFixed(1)}%</strong></div>`,
    )
    .join("");
}

function renderAll() {
  renderHero();
  renderCards();
  renderLiveCards();
  renderDailyChart();
  renderPriceChart();
  renderRelativeChart();
  renderAnnualChart();
  renderDistributionChart();
  renderMatrix();
  renderDrawdownChart();
  renderVolatilityChart();
  renderExposure();
}

all("[data-asset]").forEach((button) => {
  button.addEventListener("click", () => {
    activeAsset = button.dataset.asset;
    all("[data-asset]").forEach((b) => b.classList.toggle("active", b === button));
    renderCards();
    renderAnnualChart();
    renderDistributionChart();
    renderMatrix();
    renderDrawdownChart();
    renderVolatilityChart();
    renderPriceChart();
    renderDailyChart();
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
