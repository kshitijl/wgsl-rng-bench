// The seven workloads, each a kernel that any generator can drive. A workload gives: `kernel`, its
// shader files (after the generator's); `count`, threads per step; `params(frame, seed)`, its Params
// as bytes; `setup`, entry points run once before the first step; `buffers(device)`, its storage
// buffers by binding; optional `sliceMs`, GPU ms per animation frame (default SLICE_MS in
// bench.js); `rows`, the picture's stats as [label, class]; and `makeView({ device,
// canvas, buffers })`, returning { afterSteps(n), draw(), update(panel) } like the post's demos.

import { piDemo } from "../gpu-rng/pi.js";
import { inkDemo } from "../gpu-rng/ink.js";
import { loadWgsl, paramBytes } from "./sim.js";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });
const storage = (device, size, extra = 0) => device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | extra });

// A view that draws a full-canvas triangle with `shader` (vs and fs), reading `buffer` at binding 0.
async function bufferView({ device, canvas, size, shader, buffer }) {
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = device.createShaderModule({ code: await loadWgsl(shader) });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
  });
  const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] });
  return () => {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };
}

// A view whose only stat is a count of steps, scaled by `per` into the unit shown.
function countingView(draw, per = 1) {
  let steps = 0;
  return {
    afterSteps: (n) => { steps += n; },
    draw,
    update: (panel) => { panel.querySelector(".steps").textContent = compact.format(steps * per); },
  };
}

const PI_DARTS = 2; // DARTS in ../gpu-rng/pi.wgsl
const INK_STEP = 0.0015;
const TRACE_SIZE = 640;
const ISING_L = 2048;
const BETA = 1 / 2.269185; // the critical point, 1 / T_c = ln(1 + sqrt 2) / 2 (Onsager)
const DROPOUT_WIDTH = 2048;
const DROPOUT_P = 0.5; // KEEP in dropout-display.wgsl is 1 - this
const GAUSS_COUNT = 1 << 20;
const GAUSS_BINS = 128; // BINS and RANGE in gauss.wgsl
const GAUSS_RANGE = 6;
const RAW_COUNT = 1 << 20;

export const WORKLOADS = {
  pi: {
    kernel: ["../gpu-rng/pi", "counts"],
    count: piDemo.count,
    params: (frame, seed) => paramBytes([piDemo.count, frame, seed]),
    buffers: piDemo.buffers,
    rows: [["darts thrown", "thrown"], ["π estimate", "estimate"], ["error", "error"]],
    makeView: piDemo.makeView,
  },
  ink: {
    kernel: ["../gpu-rng/ink", "counts"],
    count: inkDemo.count,
    params: (frame, seed) => paramBytes([inkDemo.count, frame, seed], { 3: INK_STEP }),
    setup: inkDemo.setup,
    buffers: inkDemo.buffers,
    rows: [["steps", "steps"]],
    makeView: inkDemo.makeView,
  },
  trace: {
    kernel: ["../gpu-rng/trace", "trace-main"],
    count: TRACE_SIZE * TRACE_SIZE,
    params: (frame, seed) => paramBytes([TRACE_SIZE, TRACE_SIZE, frame, seed], { 4: 0 }),
    buffers: (device) => ({ 1: storage(device, TRACE_SIZE * TRACE_SIZE * 16) }),
    rows: [["samples per pixel", "steps"]],
    async makeView({ device, canvas, buffers }) {
      canvas.width = TRACE_SIZE;
      canvas.height = TRACE_SIZE;
      const context = canvas.getContext("webgpu");
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: "opaque" });
      const module = device.createShaderModule({ code: await loadWgsl("../gpu-rng/display") });
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format }] },
      });
      const size = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(size, 0, new Uint32Array([TRACE_SIZE, TRACE_SIZE, 0, 0]));
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: size } }, { binding: 1, resource: { buffer: buffers[1] } }],
      });
      return countingView(() => {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      });
    },
  },
  ising: {
    kernel: ["ising"],
    count: (ISING_L * ISING_L) / 8,
    params: (frame, seed) => paramBytes([(ISING_L * ISING_L) / 8, frame, seed], { 3: BETA }),
    setup: ["place"],
    // GPU ms per animation frame, twice the others' (bench.js SLICE_MS): at the critical point
    // domains grow slowly, and the picture only gets striking after some 10K sweeps (the user,
    // Nov 3: "more steps per frame").
    sliceMs: 14,
    buffers: (device) => ({ 1: storage(device, ISING_L * ISING_L * 4) }),
    rows: [["sweeps", "steps"]],
    async makeView({ device, canvas, buffers }) {
      const draw = await bufferView({ device, canvas, size: ISING_L / 4, shader: "ising-display", buffer: buffers[1] });
      return countingView(draw, 0.5); // a sweep is two steps, one per color
    },
  },
  dropout: {
    kernel: ["dropout"],
    count: (DROPOUT_WIDTH * DROPOUT_WIDTH) / 4,
    params: (frame, seed) => paramBytes([(DROPOUT_WIDTH * DROPOUT_WIDTH) / 4, frame, seed], { 3: DROPOUT_P }),
    setup: ["place"],
    buffers: (device) => ({ 1: storage(device, DROPOUT_WIDTH * DROPOUT_WIDTH * 4), 2: storage(device, DROPOUT_WIDTH * DROPOUT_WIDTH * 4) }),
    rows: [["masks", "steps"]],
    async makeView({ device, canvas, buffers }) {
      return countingView(await bufferView({ device, canvas, size: 512, shader: "dropout-display", buffer: buffers[2] }));
    },
  },
  gauss: {
    kernel: ["gauss"],
    count: GAUSS_COUNT,
    params: (frame, seed) => paramBytes([GAUSS_COUNT, frame, seed]),
    buffers: (device) => ({ 1: storage(device, GAUSS_BINS * 4, GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST) }),
    rows: [["samples", "samples"], ["largest |x|", "largest"]],
    makeView: gaussView,
  },
  raw: {
    kernel: ["raw"],
    count: RAW_COUNT,
    params: (frame, seed) => paramBytes([RAW_COUNT, frame, seed]),
    buffers: (device) => ({ 1: storage(device, RAW_COUNT * 16) }),
    rows: [["words", "steps"]],
    async makeView({ device, canvas, buffers }) {
      return countingView(await bufferView({ device, canvas, size: 512, shader: "raw-display", buffer: buffers[1] }), RAW_COUNT * 4);
    },
  },
};

// The histogram of every sample so far, as a density on a log scale, against the standard normal's.
// Reads the bins back and zeroes them, like the pi view's hit counter.
async function gaussView({ device, canvas, buffers }) {
  const hist = buffers[1];
  const readback = device.createBuffer({ size: GAUSS_BINS * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const totals = new Float64Array(GAUSS_BINS);
  let samples = 0;
  let reading = false;

  function afterSteps() {
    if (reading) return;
    reading = true;
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(hist, 0, readback, 0, GAUSS_BINS * 4);
    encoder.clearBuffer(hist);
    device.queue.submit([encoder.finish()]);
    readback.mapAsync(GPUMapMode.READ).then(() => {
      const counts = new Uint32Array(readback.getMappedRange());
      for (let i = 0; i < GAUSS_BINS; i++) { totals[i] += counts[i]; samples += counts[i]; }
      readback.unmap();
      reading = false;
    }, () => {});
  }

  const SIZE = 512;
  const DPR = 2;
  canvas.width = SIZE * DPR;
  canvas.height = SIZE * DPR;
  canvas.style.background = "#fafaf8";
  const g = canvas.getContext("2d");
  g.scale(DPR, DPR);
  const M = { left: 44, right: 12, top: 14, bottom: 30 };
  const LOG_MIN = -10; // density axis, log10
  const LOG_MAX = 0;
  const X = (x) => M.left + ((x + GAUSS_RANGE) / (2 * GAUSS_RANGE)) * (SIZE - M.left - M.right);
  const Y = (log) => M.top + ((LOG_MAX - log) / (LOG_MAX - LOG_MIN)) * (SIZE - M.top - M.bottom);
  const width = (2 * GAUSS_RANGE) / GAUSS_BINS;
  const center = (i) => -GAUSS_RANGE + (i + 0.5) * width;
  const normal = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

  function draw() {
    g.fillStyle = "#fafaf8";
    g.fillRect(0, 0, SIZE, SIZE);
    g.font = "11px system-ui, sans-serif";
    g.lineWidth = 1;
    for (let log = LOG_MIN; log <= LOG_MAX; log += 2) {
      g.strokeStyle = "#e4e4de";
      g.beginPath(); g.moveTo(M.left, Y(log)); g.lineTo(SIZE - M.right, Y(log)); g.stroke();
      g.fillStyle = "#55554f";
      g.textAlign = "right"; g.textBaseline = "middle";
      g.fillText(`1e${log}`, M.left - 6, Y(log));
    }
    g.textAlign = "center"; g.textBaseline = "top";
    for (let x = -GAUSS_RANGE; x <= GAUSS_RANGE; x += 2) g.fillText(String(x), X(x), SIZE - M.bottom + 8);
    // The exact density.
    g.strokeStyle = "#1c1c1a";
    g.lineWidth = 2;
    g.beginPath();
    for (let x = -GAUSS_RANGE; x <= GAUSS_RANGE; x += 0.02) {
      const y = Y(Math.max(LOG_MIN, Math.log10(normal(x))));
      if (x === -GAUSS_RANGE) g.moveTo(X(x), y); else g.lineTo(X(x), y);
    }
    g.stroke();
    // The samples' density, bin by bin; empty bins have no dot.
    g.fillStyle = "#2a78d6";
    for (let i = 0; i < GAUSS_BINS; i++) {
      if (!totals[i]) continue;
      g.beginPath();
      g.arc(X(center(i)), Y(Math.log10(totals[i] / (samples * width))), 2.5, 0, 2 * Math.PI);
      g.fill();
    }
  }

  function update(panel) {
    panel.querySelector(".samples").textContent = compact.format(samples);
    let largest = 0;
    for (let i = 0; i < GAUSS_BINS; i++) if (totals[i]) largest = Math.max(largest, Math.abs(center(i)) + width / 2);
    panel.querySelector(".largest").textContent = samples ? `< ${largest.toFixed(2)}` : "n/a";
  }

  return { afterSteps, draw, update };
}
