// Every generator on every workload, from results.json: a column per workload, steps per second
// up the side on a log scale (higher is faster), and a line per generator, named at both ends.
// Each generator has its own color; stateful ones are dashed, counter-based solid (nine
// generators, eight colors: one color is used twice, once solid and once dashed). Hovering a line
// or a generator's button picks it out, with its numbers; clicking keeps it picked. Picking a
// workload (its button, or its name under the chart) shows just that one, as bars ranked
// fastest first; stateful bars are striped.
//
// results.json is a list of runs, one per browser and machine (environment in benchmark.js), each
// with every round's ms per step. "Results from" picks one run, or the geometric mean of all of
// them. "Run all benchmarks" benchmarks every workload in this browser and adds the run, kept in
// localStorage; "copy results" copies this browser's runs as JSON, to add to results.json.
// ?autorun=1 runs them on load and POSTs the run to /__results (for collecting runs from
// several browsers on one machine; nothing on the site answers that).

import { benchmarkWorkload, environment, ROUNDS } from "./benchmark.js";
import { GENERATORS } from "./generators.js";
import { WORKLOADS } from "./workloads.js";
import { getDevice, median } from "../gpu-rng/sim.js";

const WORKLOAD_NAMES = { pi: "pi", ink: "ink", trace: "path tracer", ising: "Ising", dropout: "dropout", gauss: "Gaussians", raw: "raw words" };
// Under the columns when the chart is narrow (the article column).
const SHORT_NAMES = { pi: "pi", ink: "ink", trace: "trace", ising: "Ising", dropout: "drop", gauss: "Gauss", raw: "raw" };
// The reference categorical palette (dataviz skill), in its order, fastest overall first.
const COLORS = {
  pcg4d: "#2a78d6", threefry12: "#eb6834", xxhash32: "#1baf7a", threefry20: "#eda100", tea: "#e87ba4",
  philox: "#008300", xoshiro: "#6250d6", pcg32: "#e34948", xorwow: "#eb6834",
};
const SVG = "http://www.w3.org/2000/svg";
const M = { top: 16, right: 118, bottom: 34, left: 118 };
const HEIGHT = 420;
const LABEL_GAP = 14; // least vertical distance between two end labels
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

const el = (name, attrs = {}, parent = null) => {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
};

const STORE = "wgsl-rng-runs"; // localStorage: this browser's runs
const data = await (await fetch(new URL("results.json", import.meta.url))).json();
const localRuns = () => JSON.parse(localStorage.getItem(STORE) ?? "[]");
const allRuns = () => [...data.runs, ...localRuns()];
const workloads = Object.keys(WORKLOADS);
const sourceSelect = document.getElementById("source");
// Steps per second of generator g on workload w, in the picked run or the geometric mean of all.
const runSpeed = (run, w, g) => 1000 / median(run.workloads[w][g]);
function speed(w, g) {
  const runs = allRuns();
  const one = runs.find((r) => r.id === sourceSelect.value);
  if (one) return runSpeed(one, w, g);
  const have = runs.filter((r) => r.workloads[w]?.[g]);
  return Math.exp(have.reduce((sum, r) => sum + Math.log(runSpeed(r, w, g)), 0) / have.length);
}
const chart = document.getElementById("all");
let pinned = null;
let hovered = null;
let only = null; // a workload shown alone, or null for all

// Log-scale ticks covering [lo, hi]: 1, 2 and 5 times powers of ten.
function logTicks(lo, hi) {
  const out = [];
  for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++) {
    for (const m of [1, 2, 3, 5]) if (m * 10 ** p >= lo && m * 10 ** p <= hi) out.push(m * 10 ** p);
  }
  return out;
}

// Spread labels wanted at ys so no two are closer than LABEL_GAP, keeping their order.
function spread(ys, top, bottom) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + LABEL_GAP);
  const over = order.at(-1).y - bottom;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - LABEL_GAP);
  if (order[0].y < top) { const d = top - order[0].y; for (const o of order) o.y += d; }
  const out = [];
  for (const o of order) out[o.i] = o.y;
  return out;
}

function drawLines() {
  const width = chart.clientWidth || 700;
  const svg = el("svg", { width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, role: "img" });
  chart.append(svg);
  el("title", {}, svg).textContent = "Steps per second of each generator on each workload";

  const all = workloads.flatMap((w) => GENERATORS.map((g) => speed(w, g.id)));
  const lo = Math.min(...all) / 1.1;
  const hi = Math.max(...all) * 1.1;
  const bottom = HEIGHT - M.bottom;
  const Y = (v) => bottom - (Math.log(v / lo) / Math.log(hi / lo)) * (bottom - M.top);
  const X = (i) => M.left + (i / (workloads.length - 1)) * (width - M.left - M.right);

  for (const t of logTicks(lo, hi)) {
    el("line", { class: "grid", x1: M.left, x2: width - M.right, y1: Y(t), y2: Y(t) }, svg);
  }
  workloads.forEach((w, i) => {
    el("line", { class: "column", x1: X(i), x2: X(i), y1: M.top, y2: bottom }, svg);
    const name = el("text", { class: "workload pick", x: X(i), y: bottom + 18, "text-anchor": "middle" }, svg);
    name.textContent = (width < 640 ? SHORT_NAMES : WORKLOAD_NAMES)[w];
    name.addEventListener("click", () => setOnly(w));
  });
  // The scale's numbers sit on the gridlines, just inside the first column.
  for (const t of logTicks(lo, hi)) {
    el("text", { class: "tick", x: M.left + 4, y: Y(t) - 3 }, svg).textContent = compact.format(t);
  }
  el("text", { class: "tick", x: M.left + 4, y: M.top - 4 }, svg).textContent = "steps per second";

  const focus = pinned ?? hovered;
  chart.classList.toggle("focused", focus !== null);
  const first = spread(GENERATORS.map((g) => Y(speed(workloads[0], g.id))), M.top, bottom);
  const last = spread(GENERATORS.map((g) => Y(speed(workloads.at(-1), g.id))), M.top, bottom);
  // The picked generator is drawn last, on top.
  const order = [...GENERATORS.keys()].sort((a, b) => (GENERATORS[a].id === focus) - (GENERATORS[b].id === focus));
  for (const k of order) {
    const gen = GENERATORS[k];
    const color = COLORS[gen.id];
    const on = gen.id === focus;
    const g = el("g", { class: `g${on ? " on" : ""}` }, svg);
    const points = workloads.map((w, i) => [X(i), Y(speed(w, gen.id))]);
    const d = points.map(([x, y]) => `${x},${y}`).join(" ");
    el("polyline", { class: `line ${gen.family}`, points: d, stroke: color }, g);
    for (const [x, y] of points) el("circle", { class: "dot", cx: x, cy: y, r: on ? 4.5 : 3.5, fill: color }, g);
    // Names at both ends, with a short leader where the label had to move.
    const ends = [
      { x: points[0][0], y: points[0][1], ly: first[k], anchor: "end", dx: -10 },
      { x: points.at(-1)[0], y: points.at(-1)[1], ly: last[k], anchor: "start", dx: 10 },
    ];
    for (const e of ends) {
      el("line", { class: "lead", x1: e.x + Math.sign(e.dx) * 4, y1: e.y, x2: e.x + e.dx * 0.8, y2: e.ly, stroke: color }, g);
      el("text", { class: "end", x: e.x + e.dx, y: e.ly, "text-anchor": e.anchor, "dominant-baseline": "middle", fill: "var(--ink)" }, g).textContent = gen.name;
    }
    if (on) {
      workloads.forEach((w, i) => { el("text", { class: "value", x: points[i][0] + 6, y: points[i][1] - 8 }, g).textContent = compact.format(speed(w, gen.id)); });
    }
    const hit = el("polyline", { class: "hit", points: d }, g);
    el("title", {}, hit).textContent = `${gen.name}: ${workloads.map((w) => `${WORKLOAD_NAMES[w]} ${compact.format(speed(w, gen.id))}`).join(", ")} steps/s`;
    hit.addEventListener("pointerenter", () => setHover(gen.id));
    hit.addEventListener("pointerleave", () => setHover(null));
    hit.addEventListener("click", () => setPinned(pinned === gen.id ? null : gen.id));
  }
}

// One workload: a bar per generator, fastest at the top, from 0.
const BAR_ROW = 28;
const BAR = 16;
const PAD = 20; // above the bars, for the scale's name
function drawOne(w) {
  const width = chart.clientWidth || 700;
  const left = 132;
  const right = 56;
  const height = PAD + BAR_ROW * GENERATORS.length + 26;
  const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img" });
  chart.append(svg);
  el("title", {}, svg).textContent = `Steps per second of each generator on ${WORKLOAD_NAMES[w]}`;
  const defs = el("defs", {}, svg);
  const sorted = [...GENERATORS].sort((a, b) => speed(w, b.id) - speed(w, a.id));
  const max = speed(w, sorted[0].id);
  const ticks = [1, 2, 5].flatMap((m) => [0, 1, 2, 3, 4].map((p) => m * 10 ** p)).sort((a, b) => a - b);
  const step = ticks.find((t) => max / t <= 5);
  const top = Math.ceil(max / step) * step;
  const X = (v) => left + (v / top) * (width - left - right);
  const bottom = PAD + BAR_ROW * GENERATORS.length;
  for (let t = 0; t <= top; t += step) {
    el("line", { class: "grid", x1: X(t), x2: X(t), y1: PAD, y2: bottom }, svg);
    el("text", { class: "tick", x: X(t), y: bottom + 15, "text-anchor": "middle" }, svg).textContent = compact.format(t);
  }
  el("text", { class: "tick", x: left, y: 12 }, svg).textContent = "steps per second";
  const focus = pinned ?? hovered;
  chart.classList.toggle("focused", focus !== null);
  sorted.forEach((gen, i) => {
    const color = COLORS[gen.id];
    let fill = color;
    if (gen.family === "stateful") {
      const id = `stripes-${gen.id}`;
      const p = el("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
      el("rect", { width: 6, height: 6, fill: color, opacity: 0.35 }, p);
      el("rect", { width: 3, height: 6, fill: color }, p);
      fill = `url(#${id})`;
    }
    const y = PAD + BAR_ROW * i;
    const g = el("g", { class: `g${gen.id === focus ? " on" : ""}` }, svg);
    el("text", { class: "bar-name", x: left - 8, y: y + BAR_ROW / 2, "text-anchor": "end", "dominant-baseline": "middle" }, g).textContent = gen.name;
    const wpx = X(speed(w, gen.id)) - left;
    const r = Math.min(4, wpx / 2);
    const y0 = y + (BAR_ROW - BAR) / 2;
    el("path", { d: `M${left},${y0} h${wpx - r} a${r},${r} 0 0 1 ${r},${r} v${BAR - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(wpx - r)} z`, fill }, g);
    el("text", { class: "bar-value", x: left + wpx + 6, y: y + BAR_ROW / 2, "dominant-baseline": "middle" }, g).textContent = compact.format(speed(w, gen.id));
    const hit = el("rect", { x: 0, y, width, height: BAR_ROW, fill: "transparent", style: "cursor: pointer" }, g);
    hit.addEventListener("pointerenter", () => setHover(gen.id));
    hit.addEventListener("pointerleave", () => setHover(null));
    hit.addEventListener("click", () => setPinned(pinned === gen.id ? null : gen.id));
  });
}

function draw() {
  chart.replaceChildren();
  if (only) drawOne(only); else drawLines();
  for (const b of document.querySelectorAll("#gens button")) b.setAttribute("aria-pressed", String(b.dataset.gen === pinned));
  for (const b of document.querySelectorAll("#workloads button")) b.setAttribute("aria-pressed", String((b.dataset.w || null) === only));
}

function setOnly(w) { only = w; draw(); }

function setHover(g) { if (g !== hovered) { hovered = g; draw(); } }
function setPinned(g) { pinned = g; draw(); }

// A button per generator, with its line's color and dash, fastest overall first (geometric mean
// of its speed relative to the fastest on each workload).
const gens = document.getElementById("gens");
const best = (w) => Math.max(...GENERATORS.map((g) => speed(w, g.id)));
const geomean = (g) => Math.exp(workloads.reduce((s, w) => s + Math.log(speed(w, g) / best(w)), 0) / workloads.length);
function drawButtons() {
gens.replaceChildren();
for (const gen of [...GENERATORS].sort((a, b) => geomean(b.id) - geomean(a.id))) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.gen = gen.id;
  const dash = gen.family === "stateful" ? ` stroke-dasharray="6 4"` : "";
  b.innerHTML = `<svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke="${COLORS[gen.id]}" stroke-width="2"${dash}/></svg>${gen.name}`;
  b.addEventListener("pointerenter", () => setHover(gen.id));
  b.addEventListener("pointerleave", () => setHover(null));
  b.addEventListener("focus", () => setHover(gen.id));
  b.addEventListener("blur", () => setHover(null));
  b.addEventListener("click", () => setPinned(pinned === gen.id ? null : gen.id));
  gens.append(b);
}
}

// A button per workload, and one for all of them.
const workloadButtons = document.getElementById("workloads");
for (const w of [null, ...workloads]) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.w = w ?? "";
  b.textContent = w ? WORKLOAD_NAMES[w] : "all";
  b.addEventListener("click", () => setOnly(w));
  workloadButtons.append(b);
}

// The numbers, as a table.
const drawTable = () => document.getElementById("table").innerHTML =
  `<tr><th>steps/s</th>${workloads.map((w) => `<th>${WORKLOAD_NAMES[w]}</th>`).join("")}</tr>` +
  GENERATORS.map((g) => `<tr><td>${g.name}</td>${workloads.map((w) => `<td>${compact.format(speed(w, g.id))}</td>`).join("")}</tr>`).join("");

// The runs to pick from: the mean, then each run, this browser's last.
function fillSources(pick) {
  sourceSelect.replaceChildren(new Option(`the mean of all ${allRuns().length} runs`, "mean"));
  for (const r of allRuns()) sourceSelect.add(new Option(r.label, r.id));
  sourceSelect.value = pick;
}
function redraw() {
  if (!allRuns().length) return; // nothing measured yet
  drawButtons(); drawTable(); draw();
}

// A label for this browser and machine: its OS, browser and GPU, as far as the page can tell.
function describe(env) {
  const ua = env.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "unknown OS";
  const m = ua.match(/Firefox\/(\d+)/) ?? ua.match(/Edg\/(\d+)/) ?? ua.match(/Chrome\/(\d+)/) ?? ua.match(/Version\/(\d+[.\d]*).*Safari/);
  const browser = m ? `${m[0].split("/")[0].replace("Version", "Safari").replace("Edg", "Edge")} ${m[1]}` : "unknown browser";
  const gpu = env.gpu.description || [env.gpu.vendor, env.gpu.architecture].filter(Boolean).join(" ") || "unknown GPU";
  return `${os}, ${browser}, ${gpu}`;
}

// Benchmarks every workload here and adds the run. Returns it, or null if stopped.
const runButton = document.getElementById("runall");
const copyButton = document.getElementById("copy");
const progress = document.getElementById("progress");
const labelInput = document.getElementById("label");
let device = null;
let runId = 0;
async function runAll() {
  const id = ++runId;
  const live = () => id === runId;
  device ??= await getDevice();
  if (!device) { progress.hidden = false; progress.textContent = "This browser has no WebGPU."; return null; }
  const env = environment(device);
  labelInput.value ||= describe(env);
  runButton.textContent = "stop";
  progress.hidden = false;
  const run = { id: `${new Date().toISOString()}`, label: labelInput.value, date: new Date().toISOString(), env, rounds: ROUNDS, workloads: {} };
  for (const [i, w] of workloads.entries()) {
    progress.textContent = `benchmarking ${WORKLOAD_NAMES[w]} (${i + 1} of ${workloads.length})`;
    run.workloads[w] = await benchmarkWorkload({
      device,
      workload: WORKLOADS[w],
      keepGoing: live,
      onRound: (byGen) => { progress.textContent = `benchmarking ${WORKLOAD_NAMES[w]} (${i + 1} of ${workloads.length}), round ${Object.values(byGen)[0].length} of ${ROUNDS}`; },
    });
    if (!live()) break;
  }
  runButton.textContent = "run all benchmarks";
  if (!live() || Object.values(run.workloads).some((byGen) => Object.values(byGen)[0].length < ROUNDS)) {
    progress.textContent = "stopped";
    return null;
  }
  localStorage.setItem(STORE, JSON.stringify([...localRuns(), run]));
  progress.textContent = `done: ${run.label}`;
  copyButton.hidden = false;
  fillSources(run.id);
  redraw();
  return run;
}
runButton.addEventListener("click", () => {
  if (runButton.textContent === "stop") { runId++; return; }
  runAll();
});
// Copies this browser's runs; where the clipboard isn't allowed, shows them to copy by hand.
copyButton.addEventListener("click", async () => {
  const runs = localRuns().map((r) => ({ ...r, label: labelInput.value || r.label }));
  const json = JSON.stringify({ runs }, null, 1);
  try {
    await navigator.clipboard.writeText(json);
    progress.textContent = `copied ${runs.length} run${runs.length === 1 ? "" : "s"}`;
  } catch {
    const box = document.getElementById("json");
    box.hidden = false;
    box.value = json;
    box.select();
  }
});
copyButton.hidden = localRuns().length === 0;
// The name box starts with this machine's description; edit it before running or copying.
getDevice().then((d) => { if (d) { device ??= d; labelInput.value ||= describe(environment(d)); } });
sourceSelect.addEventListener("change", redraw);
fillSources("mean");
addEventListener("resize", draw);
redraw();

if (new URLSearchParams(location.search).has("autorun")) {
  // Progress and errors go to /__log too, for browsers whose console can't be read from outside.
  const log = (text) => fetch("/__log", { method: "POST", body: text }).catch(() => {});
  addEventListener("error", (e) => log(`error: ${e.message}`));
  addEventListener("unhandledrejection", (e) => log(`rejection: ${e.reason}`));
  setInterval(() => log(progress.textContent), 5000);
  const run = await runAll();
  if (run) await fetch("/__results", { method: "POST", body: JSON.stringify(run) });
}
