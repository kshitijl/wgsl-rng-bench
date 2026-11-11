// Every generator on every workload, from results.json: a column per workload, steps per second
// up the side on a log scale (higher is faster), and a line per generator, named at its right end
// (on a chart under LABELS_MIN wide, not named: the buttons below say which line is which).
// Each generator has its own color; stateful ones are dashed, counter-based solid (nine
// generators, eight colors: one color is used twice, once solid and once dashed). Hovering a line
// or a generator's button picks it out, with its numbers; clicking keeps it picked. Picking a
// workload (its button, or its name under the chart) shows just that one, as bars ranked
// fastest first; stateful bars are striped.
//
// results.json is a list of runs, each with every round's ms per step, its environment
// (benchmark.js) and the machine and browser it ran on. A machine and browser together are a
// setup, usually with two runs. "Results from" picks one run, one setup (the geometric mean of
// its runs), or the geometric mean of all runs.
//
// "Compare" picks what the columns are: workloads (above), or setups, which shows every machine
// and browser side by side: a column per setup, the same line per generator, at the geometric
// mean of its speed over the workloads (or its speed on the workload picked). Lines that stay
// parallel between two columns mean the same ranking, faster or slower overall; lines that cross
// mean the ranking changed. "Results from" doesn't apply there. Clicking a setup's name shows that
// setup alone, by workload.
//
// "Run all benchmarks" benchmarks every workload in this browser and adds the run, kept in
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
const LABELS_MIN = 480; // px; a narrower chart has no line names (the user, Nov 3: "in mobile no labels")
// Setup names are two lines and wider than workload names, so they get room below and at the sides.
const margins = (labels, wide, narrow) => ({ top: 16, right: labels ? 118 : wide ? 34 : 14, bottom: wide ? 50 : 34, left: wide ? (narrow ? 34 : 56) : 14 });
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
const geo = (xs) => Math.exp(xs.reduce((sum, x) => sum + Math.log(x), 0) / xs.length);
// The setups: runs grouped by machine and browser, in the order they first appear. A run made in
// this browser has neither and is a setup of its own, named by its label.
function setups() {
  const byKey = new Map();
  for (const run of allRuns()) {
    const key = run.machine ? `${run.machine}, ${run.browser}` : run.label;
    if (!byKey.has(key)) byKey.set(key, { key, machine: run.machine ?? run.label, browser: run.browser ?? "", runs: [] });
    byKey.get(key).runs.push(run);
  }
  return [...byKey.values()];
}
// The runs "results from" picks: one run, one setup's, or all of them.
const SETUP = "setup:"; // prefix of a setup's value in the select
function pickedRuns() {
  const v = sourceSelect.value;
  if (v.startsWith(SETUP)) return setups().find((s) => s.key === v.slice(SETUP.length)).runs;
  const one = allRuns().find((r) => r.id === v);
  return one ? [one] : allRuns();
}
// Steps per second of generator g on workload w: the geometric mean over runs.
const runSpeed = (run, w, g) => 1000 / median(run.workloads[w][g]);
const speedOf = (runs, w, g) => geo(runs.map((r) => runSpeed(r, w, g)));
const speed = (w, g) => speedOf(pickedRuns(), w, g);
// The generators every run in the picked source has numbers for (runs from before a generator was
// added lack it). The mean leaves out a generator some runs lack, rather than averaging it over
// fewer runs: the runs differ by up to 3x in speed (an iPhone against a laptop), so such a mean
// would compare it with the others unfairly.
function shown() {
  const runs = across === "setups" ? allRuns() : pickedRuns();
  return GENERATORS.filter((g) => runs.every((r) => workloads.every((w) => r.workloads[w]?.[g.id])));
}
// The chart's columns, each with a name (one or two lines), a title for hover text, a generator's
// speed in it, and what clicking its name does.
function columns(narrow) {
  if (across === "workloads") {
    return workloads.map((w) => ({ lines: [(narrow ? SHORT_NAMES : WORKLOAD_NAMES)[w]], title: WORKLOAD_NAMES[w], speed: (g) => speed(w, g), pick: () => setOnly(w) }));
  }
  return setups().map((s) => ({
    // Narrow, a machine goes by its first two words ("RTX 4060", "M1 Pro", "iPhone 15").
    lines: [narrow ? s.machine.split(" ").slice(0, 2).join(" ") : s.machine, s.browser].filter(Boolean),
    title: s.key,
    speed: (g) => (only ? speedOf(s.runs, only, g) : geo(workloads.map((w) => speedOf(s.runs, w, g)))),
    pick: () => { sourceSelect.value = SETUP + s.key; setAcross("workloads"); },
  }));
}
const chart = document.getElementById("all");
let pinned = null;
let hovered = null;
let only = null; // a workload shown alone, or null for all
let across = "workloads"; // what the columns are: "workloads" or "setups"

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
  const labels = width >= LABELS_MIN;
  const bySetup = across === "setups";
  const narrow = width < 640;
  const M = margins(labels, bySetup, narrow);
  const svg = el("svg", { width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, role: "img" });
  chart.append(svg);
  const measure = bySetup && !only ? "steps per second, mean over workloads" : bySetup ? `steps per second, ${WORKLOAD_NAMES[only]}` : "steps per second";
  el("title", {}, svg).textContent = bySetup ? `Each generator's ${measure}, on each machine and browser` : "Steps per second of each generator on each workload";

  const gs = shown();
  const cols = columns(narrow);
  const value = cols.map((c) => Object.fromEntries(gs.map((g) => [g.id, c.speed(g.id)])));
  const all = value.flatMap((byGen) => Object.values(byGen));
  const lo = Math.min(...all) / 1.1;
  const hi = Math.max(...all) * 1.1;
  const bottom = HEIGHT - M.bottom;
  const Y = (v) => bottom - (Math.log(v / lo) / Math.log(hi / lo)) * (bottom - M.top);
  const X = (i) => (cols.length === 1 ? (M.left + width - M.right) / 2 : M.left + (i / (cols.length - 1)) * (width - M.left - M.right));

  for (const t of logTicks(lo, hi)) {
    el("line", { class: "grid", x1: M.left, x2: width - M.right, y1: Y(t), y2: Y(t) }, svg);
  }
  cols.forEach((c, i) => {
    el("line", { class: "column", x1: X(i), x2: X(i), y1: M.top, y2: bottom }, svg);
    const name = el("text", { class: "workload pick", "text-anchor": "middle" }, svg);
    c.lines.forEach((line, k) => { el("tspan", { x: X(i), y: bottom + 18 + 15 * k, class: k ? "second" : "" }, name).textContent = line; });
    name.addEventListener("click", c.pick);
  });
  // The scale's numbers sit on the gridlines, just inside the first column.
  for (const t of logTicks(lo, hi)) {
    el("text", { class: "tick", x: M.left + 4, y: Y(t) - 3 }, svg).textContent = compact.format(t);
  }
  el("text", { class: "tick", x: M.left + 4, y: M.top - 4 }, svg).textContent = measure;

  const focus = pinned ?? hovered;
  chart.classList.toggle("focused", focus !== null);
  const last = spread(gs.map((g) => Y(value.at(-1)[g.id])), M.top, bottom);
  // The picked generator is drawn last, on top.
  const order = [...gs.keys()].sort((a, b) => (gs[a].id === focus) - (gs[b].id === focus));
  for (const k of order) {
    const gen = gs[k];
    const color = COLORS[gen.id];
    const on = gen.id === focus;
    const g = el("g", { class: `g${on ? " on" : ""}` }, svg);
    const points = cols.map((c, i) => [X(i), Y(value[i][gen.id])]);
    const d = points.map(([x, y]) => `${x},${y}`).join(" ");
    el("polyline", { class: `line ${gen.family}`, points: d, stroke: color }, g);
    for (const [x, y] of points) el("circle", { class: "dot", cx: x, cy: y, r: on ? 4.5 : 3.5, fill: color }, g);
    // The name at the right end, with a short leader where the label had to move.
    if (labels) {
      const [x, y] = points.at(-1);
      el("line", { class: "lead", x1: x + 4, y1: y, x2: x + 8, y2: last[k], stroke: color }, g);
      el("text", { class: "end", x: x + 10, y: last[k], "text-anchor": "start", "dominant-baseline": "middle", fill: "var(--ink)" }, g).textContent = gen.name;
    }
    if (on) {
      cols.forEach((c, i) => { el("text", { class: "value", x: points[i][0] + 6, y: points[i][1] - 8 }, g).textContent = compact.format(value[i][gen.id]); });
    }
    const hit = el("polyline", { class: "hit", points: d }, g);
    el("title", {}, hit).textContent = `${gen.name}: ${cols.map((c, i) => `${c.title} ${compact.format(value[i][gen.id])}`).join("; ")} steps/s`;
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
  const gs = shown();
  const height = PAD + BAR_ROW * gs.length + 26;
  const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img" });
  chart.append(svg);
  el("title", {}, svg).textContent = `Steps per second of each generator on ${WORKLOAD_NAMES[w]}`;
  const defs = el("defs", {}, svg);
  const sorted = [...gs].sort((a, b) => speed(w, b.id) - speed(w, a.id));
  const max = speed(w, sorted[0].id);
  const ticks = [1, 2, 5].flatMap((m) => [0, 1, 2, 3, 4].map((p) => m * 10 ** p)).sort((a, b) => a - b);
  const step = ticks.find((t) => max / t <= 5);
  const top = Math.ceil(max / step) * step;
  const X = (v) => left + (v / top) * (width - left - right);
  const bottom = PAD + BAR_ROW * gs.length;
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
  if (only && across === "workloads") drawOne(only); else drawLines();
  for (const b of document.querySelectorAll("#gens button")) b.setAttribute("aria-pressed", String(b.dataset.gen === pinned));
  for (const b of document.querySelectorAll("#workloads button")) b.setAttribute("aria-pressed", String((b.dataset.w || null) === only));
  for (const b of document.querySelectorAll("#across button")) b.setAttribute("aria-pressed", String(b.dataset.across === across));
  sourceSelect.disabled = across === "setups"; // every setup is on the chart
}

function setOnly(w) { only = w; drawTable(); draw(); }
function setAcross(a) { across = a; redraw(); }
for (const b of document.querySelectorAll("#across button")) b.addEventListener("click", () => setAcross(b.dataset.across));

function setHover(g) { if (g !== hovered) { hovered = g; draw(); } }
function setPinned(g) { pinned = g; draw(); }

// A button per generator, with its line's color and dash, fastest overall first (geometric mean
// of its speed relative to the fastest on each workload).
const gens = document.getElementById("gens");
const best = (w) => Math.max(...shown().map((g) => speed(w, g.id)));
const geomean = (g) => Math.exp(workloads.reduce((s, w) => s + Math.log(speed(w, g) / best(w)), 0) / workloads.length);
function drawButtons() {
gens.replaceChildren();
for (const gen of [...shown()].sort((a, b) => geomean(b.id) - geomean(a.id))) {
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
function drawTable() {
  const cols = columns(false);
  const table = document.getElementById("table");
  table.replaceChildren();
  const row = (cells) => { const tr = table.insertRow(); cells.forEach((c, i) => { tr.appendChild(document.createElement(tr.rowIndex ? "td" : "th")).textContent = c; }); };
  row(["steps/s", ...cols.map((c) => c.title)]);
  for (const g of shown()) row([g.name, ...cols.map((c) => compact.format(c.speed(g.id)))]);
}

// What to pick from: the mean of all runs, then each setup with several runs (their mean), then
// each run, this browser's last.
function fillSources(pick) {
  sourceSelect.replaceChildren(new Option(`the mean of all ${allRuns().length} runs`, "mean"));
  for (const s of setups()) if (s.runs.length > 1) sourceSelect.add(new Option(`${s.key}: the mean of ${s.runs.length} runs`, SETUP + s.key));
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
