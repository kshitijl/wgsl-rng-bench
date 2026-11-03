// The benchmark page, bench.html?w=<workload> (workloads.js). Nothing runs until a button.
// "start" runs the picture with the picked generator straight away, from where it is.
// "benchmark RNGs" first benchmarks every generator (generators.js) on the workload
// (benchmarkWorkload in benchmark.js), then runs the picture afresh. Either way it runs for RUN_MS
// of time on screen: every animation frame it gets as many steps as fit in SLICE_MS (or the
// workload's sliceMs) at its speed, the benchmark's or else one short block's (quickMs).
// Starting a run on one page stops the others open in the same browser, so they don't share the GPU.

import { drawBars } from "./bars.js";
import { benchmarkWorkload } from "./benchmark.js";
import { GENERATORS } from "./generators.js";
import { makeSim } from "./sim.js";
import { WORKLOADS } from "./workloads.js";
import { getDevice, median, quickMs } from "../gpu-rng/sim.js";

const SLICE_MS = 7;
const MAX_IN_FLIGHT = 12;
const RUN_MS = 30000;

const destroyAll = (buffers) => Object.values(buffers).forEach((b) => b.destroy());
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

async function main() {
  const name = new URLSearchParams(location.search).get("w") ?? "pi";
  const workload = WORKLOADS[name];
  if (!workload) throw new Error(`no workload ${name}`);
  const device = await getDevice();
  if (!device) {
    document.body.classList.add("no-webgpu");
    return;
  }
  const panel = document.getElementById("picture");
  const canvas = panel.querySelector("canvas");
  const bars = document.getElementById("bars");
  const picker = document.getElementById("gen");
  const buttons = ["start", "stop", "bench"].map((id) => document.getElementById(id));
  const status = document.querySelector(".status");
  const channel = new BroadcastChannel("wgsl-rng-bench");

  panel.querySelector("dl").innerHTML =
    workload.rows.map(([label, cls]) => `<dt>${label}</dt><dd class="${cls}">0</dd>`).join("") +
    `<dt>ms per step</dt><dd class="ms">n/a</dd><dt>RNG state</dt><dd class="state"></dd>`;
  for (const gen of GENERATORS) picker.add(new Option(gen.name, gen.id));

  const results = new Map(GENERATORS.map((g) => [g.id, { ms: [], stateBytes: 0 }])); // by generator id
  let shown = null; // { gen, sim, view, buffers }: the picture
  let visible = false;
  let run = 0; // bumps on every start and stop; a run that isn't the latest gives up
  let running = Promise.resolve();

  async function showGenerator(gen) {
    const buffers = workload.buffers(device);
    const sim = await makeSim({ device, workload, gen, buffers });
    const view = await workload.makeView({ device, canvas, buffers });
    const old = shown;
    shown = { gen, sim, view, buffers };
    if (old) { old.sim.destroy(); destroyAll(old.buffers); }
    draw();
  }

  function update() {
    const r = results.get(shown.gen.id);
    shown.view.update(panel);
    panel.querySelector(".ms").textContent = r.ms.length ? median(r.ms).toFixed(3) : "n/a";
    panel.querySelector(".state").textContent = `${(shown.sim.stateBytes / 1e6).toFixed(1)} MB`;
    drawBars(bars, GENERATORS.map((gen) => ({ gen, ...results.get(gen.id) })));
  }

  function draw() {
    shown.view.draw();
    update();
  }

  async function benchmark(live) {
    await showGenerator(shown.gen); // the picture starts afresh
    for (const r of results.values()) r.ms = [];
    update();
    for (const gen of GENERATORS) results.get(gen.id).stateBytes = workload.count * gen.stateBytes;
    const store = (byGen) => { for (const [id, ms] of Object.entries(byGen)) results.get(id).ms = ms; update(); };
    store(await benchmarkWorkload({ device, workload, keepGoing: live, onRound: store }));
    if (live()) status.hidden = true;
  }

  async function animate(live) {
    let quick = null; // ms per step for the picked generator, when there's no benchmark for it
    let quickFor = null;
    let inFlight = 0;
    let ran = 0; // ms on screen
    let last = null;
    while (live() && ran < RUN_MS) {
      if (!visible) {
        last = null;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const ms = results.get(shown.gen.id).ms;
      if (!ms.length && quickFor !== shown.gen) {
        // Timed on a copy, so the estimate's steps don't count in the picture.
        quickFor = shown.gen;
        const buffers = workload.buffers(device);
        const copy = await makeSim({ device, workload, gen: shown.gen, buffers });
        quick = await quickMs(device, copy);
        copy.destroy();
        destroyAll(buffers);
      }
      const slice = workload.sliceMs ?? SLICE_MS;
      const batch = Math.max(1, Math.round(slice / (ms.length ? median(ms) : quick)));
      shown.sim.step(batch);
      shown.view.afterSteps(batch);
      draw();
      inFlight++;
      device.queue.onSubmittedWorkDone().then(() => { inFlight--; });
      do await nextFrame();
      while (inFlight >= MAX_IN_FLIGHT && live());
      const now = performance.now();
      if (last !== null) ran += now - last;
      last = now;
    }
  }

  function showButtons(on) {
    const ids = on ? ["stop"] : ["start", "bench"];
    for (const b of buttons) b.hidden = !ids.includes(b.id);
  }

  function stop() {
    run++;
    status.hidden = true;
    showButtons(false);
  }

  function start(fresh) {
    const id = ++run;
    const live = () => id === run;
    channel.postMessage("start");
    status.hidden = !fresh;
    showButtons(true);
    running = running
      .then(async () => {
        if (fresh && live()) await benchmark(live);
        if (live()) await animate(live);
      })
      .finally(() => { if (id === run) stop(); });
  }

  channel.onmessage = () => { if (!buttons[1].hidden) stop(); };
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(document.body);
  const [startButton, stopButton, benchButton] = buttons;
  startButton.addEventListener("click", () => start(false));
  benchButton.addEventListener("click", () => start(true));
  stopButton.addEventListener("click", stop);
  // A new pick starts its picture afresh; a run in progress carries on with it.
  picker.addEventListener("change", () => showGenerator(GENERATORS.find((g) => g.id === picker.value)));
  addEventListener("resize", () => { if (shown) update(); });
  running = showGenerator(GENERATORS[0]); // a click before the picture is ready waits for it
  await running;
}

main();
