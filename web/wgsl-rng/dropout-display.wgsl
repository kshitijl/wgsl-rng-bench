// Draws a 512 x 512 crop from the middle of dropout's output, scaled back by 1 - p so a kept
// element shows its input value and a dropped one is black.

@group(0) @binding(0) var<storage, read> output: array<f32>;

const WIDTH = 2048u;
const CORNER = 768u; // (WIDTH - 512) / 2
const KEEP = 0.5; // 1 - p, as in workloads.js

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(xy, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = vec2u(pos.xy) + CORNER;
  let v = output[p.y * WIDTH + p.x] * KEEP;
  return vec4f(vec3f(v), 1.0);
}
