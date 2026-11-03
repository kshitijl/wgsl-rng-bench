// The ink demo: 1M particles start in three drops and take Brownian steps. The side that runs
// more steps spreads further.

import { loadWgsl } from "./sim.js";

const COUNT = 1 << 20;
const STEP = 0.0015; // standard deviation of each of a step's two moves, per axis
const SIZE = 512;
// Darkening per particle in a pixel: once spread evenly, a pixel holds COUNT / SIZE^2 particles,
// which should come out a light grey (1 - e^-0.35, 30% of the way to ink).
const DARKEN = (0.35 * SIZE * SIZE) / COUNT;

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

async function makeView({ device, canvas, buffers }) {
  const positions = buffers[1];
  let steps = 0;

  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = device.createShaderModule({ code: await loadWgsl("ink-display") });
  const look = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(look, 0, new Float32Array([DARKEN, 0, 0, 0]));
  const density = device.createTexture({
    size: [SIZE, SIZE],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const add = { color: { operation: "add", srcFactor: "one", dstFactor: "one" }, alpha: { operation: "add", srcFactor: "one", dstFactor: "one" } };
  const splat = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "splat_vs" },
    fragment: { module, entryPoint: "splat_fs", targets: [{ format: "rgba16float", blend: add }] },
    primitive: { topology: "point-list" },
  });
  const tone = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "tone_vs" },
    fragment: { module, entryPoint: "tone_fs", targets: [{ format }] },
  });
  const splatGroup = device.createBindGroup({ layout: splat.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: positions } }] });
  const toneGroup = device.createBindGroup({
    layout: tone.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: { buffer: look } },
      { binding: 2, resource: density.createView() },
    ],
  });

  function draw() {
    const encoder = device.createCommandEncoder();
    const first = encoder.beginRenderPass({
      colorAttachments: [{ view: density.createView(), loadOp: "clear", clearValue: [0, 0, 0, 0], storeOp: "store" }],
    });
    first.setPipeline(splat);
    first.setBindGroup(0, splatGroup);
    first.draw(COUNT);
    first.end();
    const second = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store" }],
    });
    second.setPipeline(tone);
    second.setBindGroup(0, toneGroup);
    second.draw(3);
    second.end();
    device.queue.submit([encoder.finish()]);
  }

  return {
    afterSteps: (n) => { steps += n; },
    draw,
    update: (panel) => { panel.querySelector(".steps").textContent = compact.format(steps); },
  };
}

// The demo, for runRace (race.js) and the RNG benchmark (../wgsl-rng/).
export const inkDemo = {
  kernel: "ink",
  count: COUNT,
  extra: STEP,
  setup: ["place"],
  buffers: (device) => ({ 1: device.createBuffer({ size: COUNT * 8, usage: GPUBufferUsage.STORAGE }) }),
  makeView,
};
