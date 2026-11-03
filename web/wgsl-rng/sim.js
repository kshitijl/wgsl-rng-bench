// Runs one workload's kernel with one generator: makeSim's step(n, timer) is what ../gpu-rng/sim.js
// times and benchmarks. A workload (workloads.js) gives the kernel files, the thread count, its
// Params for a frame, its storage buffers and its set-up entry points.

const PARAMS_STRIDE = 256; // one Params per frame in a batch, at WebGPU's uniform offset alignment
const PARAMS_BYTES = 32;
const MAX_BATCH = 64;
const WORKGROUP = 256;
export const SEED = 1;

const cache = new Map();
export function loadWgsl(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(new URL(`${name}.wgsl`, import.meta.url)).then((r) => r.text()));
  }
  return cache.get(name);
}

async function compile(device, code, label) {
  const module = device.createShaderModule({ code, label });
  const info = await module.getCompilationInfo();
  for (const m of info.messages) {
    if (m.type === "error") throw new Error(`${label}:${m.lineNum}:${m.linePos} ${m.message}`);
  }
  return module;
}

export async function shaderCode(gen, workload) {
  const files = ["../gpu-rng/philox", "common", ...(gen.family === "counter" ? ["stateless"] : []), ...gen.files, ...workload.kernel];
  return (await Promise.all(files.map(loadWgsl))).join("\n");
}

// Params as bytes: u32 words, and floats at the given word positions.
export function paramBytes(words, floats = {}) {
  const buffer = new ArrayBuffer(PARAMS_BYTES);
  new Uint32Array(buffer).set(words);
  const f = new Float32Array(buffer);
  for (const [at, v] of Object.entries(floats)) f[Number(at)] = v;
  return buffer;
}

export async function makeSim({ device, workload, gen, buffers }) {
  const module = await compile(device, await shaderCode(gen, workload), `${workload.id} ${gen.id}`);
  const count = workload.count;
  const params = device.createBuffer({ size: PARAMS_STRIDE * MAX_BATCH, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const states = gen.stateBytes ? device.createBuffer({ size: count * gen.stateBytes, usage: GPUBufferUsage.STORAGE }) : null;

  const entries = [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } }];
  const groupEntries = [{ binding: 0, resource: { buffer: params, size: PARAMS_BYTES } }];
  const all = { ...buffers, ...(states ? { 9: states } : {}) };
  for (const [binding, buffer] of Object.entries(all)) {
    entries.push({ binding: Number(binding), visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } });
    groupEntries.push({ binding: Number(binding), resource: { buffer } });
  }
  const groupLayout = device.createBindGroupLayout({ entries });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [groupLayout] });
  const group = device.createBindGroup({ layout: groupLayout, entries: groupEntries });
  const pipeline = (entryPoint) => device.createComputePipeline({ layout, compute: { module, entryPoint } });
  const main = pipeline("main");
  const groups = Math.ceil(count / WORKGROUP);

  let frame = 0;
  const writeParams = (n) => {
    const bytes = new Uint8Array(PARAMS_STRIDE * n);
    for (let i = 0; i < n; i++) bytes.set(new Uint8Array(workload.params(frame + i, SEED)), PARAMS_STRIDE * i);
    device.queue.writeBuffer(params, 0, bytes);
  };

  // Set-up passes, then (stateful) every thread's generator, once.
  const once = [...(workload.setup ?? []), ...(states ? ["init"] : [])];
  if (once.length) {
    writeParams(1);
    const encoder = device.createCommandEncoder();
    for (const entry of once) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline(entry));
      pass.setBindGroup(0, group, [0]);
      pass.dispatchWorkgroups(groups);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
  }

  // Run n frames, one compute pass each, timed by `timer` (makeTimer in ../gpu-rng/sim.js) if given.
  function step(n = 1, timer = null) {
    for (let done = 0; done < n; ) {
      const batch = Math.min(MAX_BATCH, n - done);
      writeParams(batch);
      const encoder = device.createCommandEncoder();
      for (let i = 0; i < batch; i++) {
        const pass = encoder.beginComputePass(timer?.passDescriptor(done + i, n));
        pass.setPipeline(main);
        pass.setBindGroup(0, group, [i * PARAMS_STRIDE]);
        pass.dispatchWorkgroups(groups);
        pass.end();
      }
      device.queue.submit([encoder.finish()]);
      frame += batch;
      done += batch;
    }
  }

  return {
    step,
    frames: () => frame,
    stateBytes: count * gen.stateBytes,
    destroy: () => { params.destroy(); states?.destroy(); },
  };
}
