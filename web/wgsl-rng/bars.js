// The benchmark's chart: one horizontal bar per generator, its speed in steps per second (from its
// median ms per step), fastest at the top, colored by family. Hovering a row shows its numbers.

import { FAMILIES } from "./generators.js";
import { median } from "../gpu-rng/sim.js";

const SVG = "http://www.w3.org/2000/svg";
const ROW = 26;
const BAR = 14;
const M = { top: 4, right: 76, bottom: 22, left: 128 };
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

const el = (name, attrs = {}, parent = null) => {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
};

// Round numbers for the axis, about `n` of them from 0 to max.
function ticks(max, n = 4) {
  const raw = max / n;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
}

// `rows`: [{ gen, ms: [ms per step, round by round], stateBytes }].
export function drawBars(container, rows) {
  container.replaceChildren();
  const legend = document.createElement("div");
  legend.className = "legend";
  for (const f of Object.values(FAMILIES)) {
    const item = document.createElement("span");
    item.innerHTML = `<span class="swatch ${f.color}"></span>${f.name}`;
    legend.append(item);
  }
  container.append(legend);

  const speed = (r) => (r.ms.length ? 1000 / median(r.ms) : 0);
  const sorted = [...rows].sort((a, b) => speed(b) - speed(a));
  const width = container.clientWidth || 480;
  const height = M.top + ROW * sorted.length + M.bottom;
  const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img" });
  container.append(svg);
  const top = Math.max(...sorted.map(speed));
  const scale = top > 0 ? ticks(top * 1.05) : [0];
  const max = Math.max(top, scale.at(-1)) || 1;
  const X = (v) => M.left + (v / max) * (width - M.left - M.right);
  const plotBottom = M.top + ROW * sorted.length;

  for (const t of scale) {
    el("line", { class: "grid", x1: X(t), x2: X(t), y1: M.top, y2: plotBottom }, svg);
    el("text", { class: "tick", x: X(t), y: plotBottom + 15, "text-anchor": "middle" }, svg).textContent = compact.format(t);
  }
  el("text", { class: "tick", x: width - M.right, y: plotBottom + 15, "text-anchor": "start", dx: 8 }, svg).textContent = "steps/s";

  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  container.append(tip);

  sorted.forEach((r, i) => {
    const y = M.top + ROW * i;
    const color = FAMILIES[r.gen.family].color;
    const row = el("g", { class: "row" }, svg);
    el("title", {}, row).textContent = r.ms.length ? `${r.gen.name}: ${compact.format(speed(r))} steps/s` : r.gen.name;
    el("rect", { class: "hit", x: 0, y, width, height: ROW }, row);
    el("text", { class: "name", x: M.left - 8, y: y + ROW / 2, "text-anchor": "end", "dominant-baseline": "middle" }, row).textContent = r.gen.name;
    if (!r.ms.length) return;
    const w = Math.max(0, X(speed(r)) - M.left);
    // Square at the baseline, rounded at the value's end.
    const r4 = Math.min(4, w / 2);
    const y0 = y + (ROW - BAR) / 2;
    el("path", {
      class: `bar ${color}`,
      d: `M${M.left},${y0} h${w - r4} a${r4},${r4} 0 0 1 ${r4},${r4} v${BAR - 2 * r4} a${r4},${r4} 0 0 1 ${-r4},${r4} h${-(w - r4)} z`,
    }, row);
    el("text", { class: "value", x: M.left + w + 6, y: y + ROW / 2, "dominant-baseline": "middle" }, row).textContent = compact.format(speed(r));

    row.addEventListener("pointermove", (e) => {
      const ms = [...r.ms].sort((a, b) => a - b);
      tip.innerHTML =
        `<div class="tip-name"><span class="swatch ${color}"></span><strong>${r.gen.name}</strong></div>` +
        `<div>${median(r.ms).toFixed(3)} ms per step</div>` +
        `<div class="quiet">${ms[0].toFixed(3)} to ${ms.at(-1).toFixed(3)} ms over ${ms.length} rounds</div>` +
        `<div class="quiet">${FAMILIES[r.gen.family].name}, state ${(r.stateBytes / 1e6).toFixed(1)} MB</div>`;
      tip.hidden = false;
      const box = container.getBoundingClientRect();
      const left = Math.min(e.clientX - box.left + 12, box.width - tip.offsetWidth);
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${legend.offsetHeight + y + ROW}px`;
    });
    row.addEventListener("pointerleave", () => { tip.hidden = true; });
  });
}
