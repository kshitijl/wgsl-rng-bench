// Ink diffusing in water: particles taking Brownian random-walk steps in the square [-1, 1]^2,
// bouncing off its walls. Each frame, each particle loads its position, draws four Gaussians
// (one draw, through Box-Muller) for two steps, and stores its position. Needs rand4 from
// rng-stateful.wgsl or rng-stateless.wgsl.

struct Params {
  count: u32, // particles
  frame: u32,
  seed: u32,
  step: f32, // standard deviation of a step, per axis
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<vec2f>;

const CALLS = 1u;
const PI = 3.14159265;

// Four independent standard normals from four uniforms in [0, 1).
fn gaussians(u: vec4f) -> vec4f {
  let r1 = sqrt(-2.0 * log(1.0 - u.x));
  let r2 = sqrt(-2.0 * log(1.0 - u.z));
  let a1 = 2.0 * PI * u.y;
  let a2 = 2.0 * PI * u.w;
  return vec4f(r1 * cos(a1), r1 * sin(a1), r2 * cos(a2), r2 * sin(a2));
}

// Fold a coordinate back into [-1, 1], as if it bounced off the wall.
fn bounce(v: vec2f) -> vec2f {
  var p = v;
  p = select(p, 2.0 - p, p > vec2f(1.0));
  p = select(p, -2.0 - p, p < vec2f(-1.0));
  return p;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.count) { return; }
  rng_begin(id.x, params.frame);
  let g = gaussians(rand4(0u));
  rng_end();
  var p = positions[id.x];
  p = bounce(p + params.step * g.xy);
  p = bounce(p + params.step * g.zw);
  positions[id.x] = p;
}

// The starting drops: each particle starts in one of three small blobs. Uses its own key, so it's
// the same for both variants and independent of their draws.
@compute @workgroup_size(256)
fn place(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.count) { return; }
  let g = gaussians(to_unit_floats(philox4x32_10(vec4u(id.x, 0u, 0u, 0u), vec2u(params.seed, 0x5EED5u))));
  let drop = id.x % 3u;
  var centers = array(vec2f(-0.45, 0.35), vec2f(0.4, 0.45), vec2f(0.0, -0.4));
  positions[id.x] = centers[drop] + 0.04 * g.xy;
}
