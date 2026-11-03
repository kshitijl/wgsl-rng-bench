// Draws the particles as ink on paper: first every particle adds 1 to its pixel of a density
// image, then each pixel's color goes from paper toward ink as its density rises.

@group(0) @binding(0) var<storage, read> positions: array<vec2f>;
@group(0) @binding(1) var<uniform> look: vec4f; // x: darkening per particle in a pixel

@vertex
fn splat_vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(positions[i], 0.0, 1.0);
}

@fragment
fn splat_fs() -> @location(0) vec4f {
  return vec4f(1.0, 0.0, 0.0, 0.0);
}

@group(0) @binding(2) var density: texture_2d<f32>;

const PAPER = vec3f(0.98, 0.98, 0.973);
const INK = vec3f(0.10, 0.12, 0.20);

@vertex
fn tone_vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(xy, 0.0, 1.0);
}

@fragment
fn tone_fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let d = textureLoad(density, vec2i(pos.xy), 0).r;
  let ink = 1.0 - exp(-look.x * d);
  return vec4f(mix(PAPER, INK, ink), 1.0);
}
