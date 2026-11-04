// The site's animated cover for the WGSL RNG post (the user, Nov 4: "on the main website the cover
// should be moving, the ising modeling happening"; the post keeps its still): the Ising workload
// (critical temperature, 2048 x 2048, one generator) warmed up, then filmed every few sweeps.
// Each frame is the top-left CROP x CROP spins, one pixel per spin, in ising-display.wgsl's
// colors, shrunk to OUT px, then (in ffmpeg) blurred a little and shrunk to 300 px. The frames play forward and then backward, so the loop has no seam
// (at equilibrium the reversed dynamics look the same).
//
//   python3 -m http.server 4361 --bind 127.0.0.1          # from the repo root
//   chrome --headless=new --enable-unsafe-webgpu --remote-debugging-port=9333 --user-data-dir=DIR
//   node tools/ising-video.mjs http://127.0.0.1:4361 out.mp4 [gen] [warm sweeps] [frames] [sweeps/frame] [crop] [out px]
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [, , origin, out, gen = "threefry12", warm = "2000", count = "150", per = "2", crop = "1024", px = "600"] = process.argv;
const work = mkdtempSync(join(tmpdir(), "ising-video-"));
const tab = await (await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent(origin + "/README.md")}`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expr) => {
  const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (res.result.exceptionDetails) { console.error(JSON.stringify(res.result.exceptionDetails).slice(0, 800)); process.exit(1); }
  return res.result.result.value;
};
await new Promise((r) => setTimeout(r, 1500));
await run(`(async () => {
  const { getDevice } = await import("/web/gpu-rng/sim.js");
  const { GENERATORS } = await import("/web/wgsl-rng/generators.js");
  const { makeSim } = await import("/web/wgsl-rng/sim.js");
  const { WORKLOADS } = await import("/web/wgsl-rng/workloads.js");
  const device = await getDevice();
  const w = WORKLOADS.ising, gen = GENERATORS.find((g) => g.id === "${gen}");
  const buffers = w.buffers(device); buffers[1].destroy(); buffers[1] = device.createBuffer({ size: 2048 * 2048 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const sim = await makeSim({ device, workload: w, gen, buffers });
  const steps = async (n) => { for (let done = 0; done < n; done += 500) { sim.step(Math.min(500, n - done)); await device.queue.onSubmittedWorkDone(); } };
  await steps(2 * ${warm}); // a sweep is two half-steps, one per checkerboard color
  const L = 2048, C = ${crop}, bytes = C * L * 4; // the first C rows
  const read = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const big = new OffscreenCanvas(C, C), bg = big.getContext("2d"), img = bg.createImageData(C, C);
  const small = new OffscreenCanvas(${px}, ${px}), sg = small.getContext("2d");
  sg.imageSmoothingQuality = "high";
  const UP = [0.98, 0.98, 0.973], DOWN = [0.10, 0.12, 0.20];
  window.frame = async () => {
    await steps(2 * ${per});
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(buffers[1], 0, read, 0, bytes); device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const spins = new Uint32Array(read.getMappedRange());
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const col = spins[y * L + x] === 1 ? UP : DOWN, i = 4 * (y * C + x);
      img.data[i] = col[0] * 255; img.data[i + 1] = col[1] * 255; img.data[i + 2] = col[2] * 255; img.data[i + 3] = 255;
    }
    read.unmap();
    bg.putImageData(img, 0, 0);
    sg.drawImage(big, 0, 0, ${px}, ${px});
    const blob = await small.convertToBlob({ type: "image/png" });
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
  };
})()`);
const files = [];
for (let k = 0; k < +count; k++) {
  const file = join(work, `f${String(k).padStart(4, "0")}.png`);
  writeFileSync(file, Buffer.from(await run("frame()"), "base64"));
  files.push(file);
}
const order = [...files, ...files.slice(1, -1).reverse()];
writeFileSync(join(work, "list.txt"), ["ffconcat version 1.0", ...order.flatMap((f) => [`file '${f}'`, "duration 0.0333"])].join("\n") + "\n");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(work, "list.txt"),
  // Shrunk to 300 px after a slight blur, at 15 fps: spin-level noise barely compresses (sharp
  // at 600 px, 30 fps, it was 14 MB; this is about 0.5 MB), and a card shows ~190 CSS px.
  "-vf", "gblur=sigma=1.5,scale=300:300,fps=15,format=yuv420p", "-c:v", "libx264", "-crf", "34", "-preset", "veryslow", "-movflags", "+faststart", "-an", out]);
console.log(JSON.stringify({ frames: order.length, work }));
process.exit(0);
