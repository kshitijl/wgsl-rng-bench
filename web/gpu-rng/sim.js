// Runs a one-thread-per-item kernel (pi.wgsl, ink.wgsl) with stateful or stateless random
// numbers, and times the two against each other. Shared by the pi and ink demos and the benchmark.

const PARAMS_STRIDE = 256; // one Params per frame in a batch, at WebGPU's uniform offset alignment
const MAX_BATCH = 64;
const WORKGROUP = 256;
// Bytes of generator state per thread, by kind: PhiloxState is vec4u + vec2u, padded to 16-byte
// alignment; XorwowState is six u32s.
const STATE_BYTES = { stateful: 32, stateless: 0, xorwow: 24 };
// The shader files defining each kind's rng_begin, rand4 and rng_end (after philox.wgsl).
const RNG_SOURCES = { stateful: ["rng-stateful"], stateless: ["rng-stateless"], xorwow: ["xorwow-core", "rng-xorwow"] };
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

export async function getDevice() {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice({
    requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize },
    requiredFeatures: adapter.features.has("timestamp-query") ? ["timestamp-query"] : [],
  });
  device.addEventListener("uncapturederror", (e) => console.error(e.error.message));
  return device;
}

// `kernel` is "pi" or "ink"; `kind` is "stateful" (Philox with a stored state, like cuRAND), "xorwow"
// (stored state too) or "stateless" (Philox). `buffers` maps the kernel's
// binding numbers (1, 2, ...) to storage buffers. `extra` is Params' fourth word, a float.
// `setup` names entry points to run once, in order, before the first frame (like ink's "place").
export async function makeSim({ device, kernel, kind, count, buffers, extra = 0, setup = [] }) {
  const stateBytes = STATE_BYTES[kind];
  const stateful = stateBytes > 0;
  const parts = ["philox", ...RNG_SOURCES[kind], kernel];
  const code = (await Promise.all(parts.map(loadWgsl))).join("\n");
  const module = await compile(device, code, `${kernel} ${kind}`);

  const params = device.createBuffer({ size: PARAMS_STRIDE * MAX_BATCH, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const states = stateful ? device.createBuffer({ size: count * stateBytes, usage: GPUBufferUsage.STORAGE }) : null;

  const entries = [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } }];
  const groupEntries = [{ binding: 0, resource: { buffer: params, size: 16 } }];
  for (const [binding, buffer] of Object.entries(buffers)) {
    entries.push({ binding: Number(binding), visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } });
    groupEntries.push({ binding: Number(binding), resource: { buffer } });
  }
  if (states) {
    entries.push({ binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } });
    groupEntries.push({ binding: 9, resource: { buffer: states } });
  }
  const groupLayout = device.createBindGroupLayout({ entries });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [groupLayout] });
  const group = device.createBindGroup({ layout: groupLayout, entries: groupEntries });
  const pipeline = (entryPoint) => device.createComputePipeline({ layout, compute: { module, entryPoint } });
  const main = pipeline("main");
  const groups = Math.ceil(count / WORKGROUP);

  let frame = 0;
  const writeParams = (n) => {
    const words = new Uint32Array((PARAMS_STRIDE / 4) * n);
    const floats = new Float32Array(words.buffer);
    for (let i = 0; i < n; i++) {
      const at = (PARAMS_STRIDE / 4) * i;
      words.set([count, frame + i, SEED], at);
      floats[at + 3] = extra;
    }
    device.queue.writeBuffer(params, 0, words);
  };

  // Set-up passes, then (stateful) every thread's generator, once.
  const once = [...setup, ...(stateful ? ["init"] : [])];
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

  // Run n frames, one compute pass each. With a timer (makeTimer), the GPU writes timestamps at
  // the start of the first pass and the end of the last.
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
    stateBytes: count * stateBytes,
    destroy: () => { params.destroy(); states?.destroy(); },
  };
}

// Resolves once the GPU has finished everything submitted so far. It reads back 4 bytes copied
// after that work: the queue runs in order, so the read can't finish first. (onSubmittedWorkDone
// should do the same, but browsers differ in how promptly and how strictly they resolve it.)
const probes = new WeakMap();
export async function gpuDone(device) {
  if (!probes.has(device)) {
    probes.set(device, {
      src: device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_SRC }),
      dst: device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
    });
  }
  const { src, dst } = probes.get(device);
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(src, 0, dst, 0, 4);
  device.queue.submit([encoder.finish()]);
  await dst.mapAsync(GPUMapMode.READ);
  dst.unmap();
}

// GPU timestamps around a block of passes, where the browser has them: the GPU's own clock, so
// no waiting on the CPU side gets counted. Null where it doesn't. A block is submitted in batches
// of up to MAX_BATCH passes, and each batch gets its own pair of timestamps (its first pass's
// start, its last pass's end): a pair spanning submissions gave negative times or lost the device
// (Chrome 156, Metal), so the block's time is the sum of its batches'.
const MAX_TIMED_BATCHES = 1024;
export function makeTimer(device) {
  if (!device.features.has("timestamp-query")) return null;
  const querySet = device.createQuerySet({ type: "timestamp", count: 2 * MAX_TIMED_BATCHES });
  const bytes = 16 * MAX_TIMED_BATCHES;
  const resolve = device.createBuffer({ size: bytes, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  const read = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  let batches = 0;
  return {
    // The largest block it can time.
    maxFrames: MAX_BATCH * MAX_TIMED_BATCHES,
    // The compute pass descriptor for pass i of a block of n.
    passDescriptor(i, n) {
      const b = Math.floor(i / MAX_BATCH);
      const first = i % MAX_BATCH === 0;
      const last = i % MAX_BATCH === MAX_BATCH - 1 || i === n - 1;
      if (!first && !last) return undefined;
      batches = Math.max(batches, b + 1);
      return {
        timestampWrites: {
          querySet,
          ...(first ? { beginningOfPassWriteIndex: 2 * b } : {}),
          ...(last ? { endOfPassWriteIndex: 2 * b + 1 } : {}),
        },
      };
    },
    // Milliseconds of GPU time in the block just run: the sum of its batches'.
    async ms() {
      const count = 2 * batches;
      batches = 0;
      const encoder = device.createCommandEncoder();
      encoder.resolveQuerySet(querySet, 0, count, resolve, 0);
      encoder.copyBufferToBuffer(resolve, 0, read, 0, count * 8);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ, 0, count * 8);
      const t = new BigInt64Array(read.getMappedRange(0, count * 8));
      let total = 0n;
      for (let i = 0; i < count; i += 2) total += t[i + 1] - t[i];
      read.unmap();
      return Number(total) / 1e6;
    },
  };
}

// Milliseconds per frame for n frames run back to back by run(n, timer). One side at a time, in
// long blocks: sharing the GPU, or short bursts (the GPU idles and its clock drops), move the
// timings more than the difference being measured. With a timer, by GPU timestamps; without,
// by the wall clock from submission until the GPU is done.
export async function timeRun(device, run, n, timer) {
  if (timer) {
    run(n, timer);
    return (await timer.ms()) / n;
  }
  await gpuDone(device);
  const t0 = performance.now();
  run(n, null);
  await gpuDone(device);
  return (performance.now() - t0) / n;
}

export const timeBlock = (device, sim, n, timer = null) => timeRun(device, (k, t) => sim.step(k, t), n, timer);

// How long a block should be. With timestamps, blockMs. Without, also at least 20 times how late
// this browser reports the GPU done (Firefox 159: 100 ms, so 2 s blocks), so that delay is a
// small part of each block.
export async function blockMsFor(device, timer, blockMs) {
  if (timer) return blockMs;
  const waits = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await gpuDone(device);
    waits.push(performance.now() - t0);
  }
  return Math.max(blockMs, 20 * median(waits));
}

// How many frames make a block of at least blockMs on every side: double until it does.
export async function blockFrames(device, sims, blockMs, time = (s, n) => timeBlock(device, s, n)) {
  let n = 1;
  for (;;) {
    let longest = 0;
    for (const s of sims) longest = Math.max(longest, (await time(s, n)) * n);
    if (longest >= blockMs || n >= MAX_BATCH * MAX_TIMED_BATCHES) return n;
    n *= 2;
  }
}

// A rough ms per frame for one sim, from one short block (about targetMs), for running at about
// the right speed before (or without) a benchmark. It runs the sim's steps, so its picture moves on.
export async function quickMs(device, sim, targetMs = 20) {
  const timer = makeTimer(device);
  const time = (s, n) => timeBlock(device, s, n, timer);
  const n = await blockFrames(device, [sim], await blockMsFor(device, timer, targetMs), time);
  return time(sim, n);
}

// Rounds of alternating blocks, at least blockMs each, the same number of frames for both sides.
// Calls onRound(roundsSoFar) after each round. Returns each sim's ms per frame, round by round.
export async function measure({ device, sims, rounds = 8, blockMs = 120, onRound = () => {}, keepGoing = () => true }) {
  const timer = makeTimer(device);
  const time = (s, n) => timeBlock(device, s, n, timer);
  const n = await blockFrames(device, sims, await blockMsFor(device, timer, blockMs), time);
  const results = sims.map(() => []);
  for (let r = 0; r < rounds && keepGoing(); r++) {
    for (const i of turnOrder(sims.length, r)) results[i].push(await time(sims[i], n));
    onRound(results);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return results;
}

// Who goes first takes turns: round r starts with side r mod n.
export const turnOrder = (n, r) => Array.from({ length: n }, (_, i) => (r + i) % n);

export const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
