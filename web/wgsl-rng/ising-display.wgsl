// Draws the Ising spins at a quarter size: each pixel averages a 4 x 4 block of sites, up white
// and down dark.

@group(0) @binding(0) var<storage, read> spins: array<u32>;

const L = 2048u;
const BLOCK = 4u;
const UP = vec3f(0.98, 0.98, 0.973);
const DOWN = vec3f(0.10, 0.12, 0.20);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(xy, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let corner = vec2u(pos.xy) * BLOCK;
  var up = 0u;
  for (var dy = 0u; dy < BLOCK; dy++) {
    for (var dx = 0u; dx < BLOCK; dx++) { up += spins[(corner.y + dy) * L + corner.x + dx]; }
  }
  return vec4f(mix(DOWN, UP, f32(up) / f32(BLOCK * BLOCK)), 1.0);
}
