// Runs the Ising workload with one generator in headless Chrome and saves the spins as a
// 2048 x 2048 PNG, one pixel per site, in ising-display.wgsl's colors. The post's picture
// (klauria.tech public/wgsl-rng-benchmark-ising.png, Nov 3) is threefry12, 20000 sweeps, seed 1,
// then `magick in.png -colors 2 -define png:bit-depth=1 -strip PNG8:out.png` (346 KB, lossless).
//
//   python3 -m http.server 4361 --bind 127.0.0.1          # from the repo root
//   chrome --headless=new --enable-unsafe-webgpu --remote-debugging-port=9333 --user-data-dir=DIR
//   node tools/ising-png.mjs http://127.0.0.1:4361 threefry12 20000 out.png
import { writeFileSync } from "node:fs";
const [, , origin, gen, sweeps, out] = process.argv;
const tab = await (await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent(origin + "/README.md")}`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await new Promise((r) => setTimeout(r, 1500));
const expr = `(async () => {
  const { getDevice } = await import("/web/gpu-rng/sim.js");
  const { GENERATORS } = await import("/web/wgsl-rng/generators.js");
  const { makeSim } = await import("/web/wgsl-rng/sim.js");
  const { WORKLOADS } = await import("/web/wgsl-rng/workloads.js");
  const device = await getDevice();
  const w = WORKLOADS.ising, gen = GENERATORS.find((g) => g.id === "${gen}");
  const buffers = w.buffers(device); buffers[1].destroy(); buffers[1] = device.createBuffer({ size: 2048 * 2048 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const sim = await makeSim({ device, workload: w, gen, buffers });
  const steps = 2 * ${sweeps};
  const t0 = performance.now();
  for (let done = 0; done < steps; done += 500) { sim.step(Math.min(500, steps - done)); await device.queue.onSubmittedWorkDone(); }
  const ms = performance.now() - t0;
  const L = 2048, bytes = L * L * 4;
  const read = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(buffers[1], 0, read, 0, bytes); device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const spins = new Uint32Array(read.getMappedRange());
  const c = new OffscreenCanvas(L, L), g = c.getContext("2d"), img = g.createImageData(L, L);
  const UP = [0.98, 0.98, 0.973], DOWN = [0.10, 0.12, 0.20];
  let up = 0;
  for (let i = 0; i < L * L; i++) { const col = spins[i] === 1 ? UP : DOWN; up += spins[i]; for (let k = 0; k < 3; k++) img.data[4*i+k] = Math.round(col[k] * 255); img.data[4*i+3] = 255; }
  g.putImageData(img, 0, 0);
  const blob = await c.convertToBlob({ type: "image/png" });
  const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
  return JSON.stringify({ ms, up: up / (L * L), png: b64 });
})()`;
const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
if (res.result.exceptionDetails) { console.error(JSON.stringify(res.result.exceptionDetails).slice(0, 800)); process.exit(1); }
const v = JSON.parse(res.result.result.value);
writeFileSync(out, Buffer.from(v.png, "base64"));
console.log(`steps took ${(v.ms / 1000).toFixed(1)} s, fraction up ${v.up.toFixed(3)}, wrote ${out}`);
process.exit(0);
