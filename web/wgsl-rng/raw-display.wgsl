// Draws the first 512 x 512 random words as grey levels, from each word's top byte.

@group(0) @binding(0) var<storage, read> words: array<u32>;

const SIZE = 512u;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(xy, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = vec2u(pos.xy);
  return vec4f(vec3f(f32(words[p.y * SIZE + p.x] >> 24u) / 255.0), 1.0);
}
