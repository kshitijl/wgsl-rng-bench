// Draws the unit square with the quarter circle's edge, then the latest darts as points: dark
// inside the circle, light outside.

@group(0) @binding(0) var<storage, read> darts: array<vec2f>;
@group(0) @binding(1) var<uniform> size: vec4f; // canvas width and height in pixels

const PAPER = vec3f(0.98, 0.98, 0.973);
const INSIDE = vec3f(0.11, 0.11, 0.10);
const OUTSIDE = vec3f(0.62, 0.62, 0.58);
const EDGE = vec3f(0.33, 0.33, 0.31);

@vertex
fn background_vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(xy, 0.0, 1.0);
}

@fragment
fn background_fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = vec2f(pos.x / size.x, 1.0 - pos.y / size.y);
  let on_edge = abs(length(p) - 1.0) * size.x < 1.0;
  return vec4f(select(PAPER, EDGE, on_edge), 1.0);
}

struct Dart {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn dart_vs(@builtin(vertex_index) i: u32) -> Dart {
  let d = darts[i];
  let color = select(OUTSIDE, INSIDE, dot(d, d) < 1.0);
  return Dart(vec4f(d * 2.0 - 1.0, 0.0, 1.0), color);
}

@fragment
fn dart_fs(dart: Dart) -> @location(0) vec4f {
  return vec4f(dart.color, 1.0);
}
