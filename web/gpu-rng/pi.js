// The pi demo: 1M threads each throw 2 darts a step. Each side counts its hits and shows its
// estimate, and draws the latest darts.

import { loadWgsl } from "./sim.js";

const COUNT = 1 << 20;
const DARTS_PER_THREAD = 2; // DARTS in pi.wgsl
const SHOWN = 40000; // darts drawn per frame
const SIZE = 512;

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });

async function makeView({ device, canvas, buffers }) {
  const hits = buffers[1];
  const darts = buffers[2];
  const readback = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  let inside = 0;
  let thrown = 0;
  let pending = 0; // steps run since hits was last read
  let reading = false;

  // Read the hit counter and zero it, unless the last read is still in flight; then it keeps
  // counting until the next chance.
  function afterSteps(n) {
    pending += n;
    if (reading) return;
    const steps = pending;
    pending = 0;
    reading = true;
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(hits, 0, readback, 0, 4);
    encoder.clearBuffer(hits);
    device.queue.submit([encoder.finish()]);
    readback.mapAsync(GPUMapMode.READ).then(() => {
      inside += new Uint32Array(readback.getMappedRange())[0];
      thrown += steps * COUNT * DARTS_PER_THREAD;
      readback.unmap();
      reading = false;
    }, () => {});
  }

  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = device.createShaderModule({ code: await loadWgsl("pi-display") });
  const size = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(size, 0, new Float32Array([SIZE, SIZE, 0, 0]));
  const pipeline = (vs, fs, topology) =>
    device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: vs },
      fragment: { module, entryPoint: fs, targets: [{ format }] },
      primitive: { topology },
    });
  const background = pipeline("background_vs", "background_fs", "triangle-list");
  const points = pipeline("dart_vs", "dart_fs", "point-list");
  const backgroundGroup = device.createBindGroup({ layout: background.getBindGroupLayout(0), entries: [{ binding: 1, resource: { buffer: size } }] });
  const pointsGroup = device.createBindGroup({ layout: points.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: darts } }] });

  function draw() {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(background);
    pass.setBindGroup(0, backgroundGroup);
    pass.draw(3);
    pass.setPipeline(points);
    pass.setBindGroup(0, pointsGroup);
    pass.draw(SHOWN);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function update(panel) {
    panel.querySelector(".thrown").textContent = compact.format(thrown);
    const estimate = thrown ? (4 * inside) / thrown : null;
    panel.querySelector(".estimate").textContent = thrown ? estimate.toFixed(7) : "n/a";
    panel.querySelector(".error").textContent = thrown ? Math.abs(estimate - Math.PI).toExponential(1) : "n/a";
  }

  return { afterSteps, draw, update };
}

// The demo, for runRace (race.js) and the RNG benchmark (../wgsl-rng/).
export const piDemo = {
  kernel: "pi",
  count: COUNT,
  buffers: (device) => ({
    1: device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }),
    2: device.createBuffer({ size: COUNT * 8, usage: GPUBufferUsage.STORAGE }),
  }),
  makeView,
};
