// Dropout on a 2048 x 2048 image of floats: each element is kept with probability 1 - p and
// scaled by 1 / (1 - p), or zeroed. Each thread does four elements with one rand4.

struct Params {
  count: u32, // threads: elements / 4
  frame: u32,
  seed: u32,
  p: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> input: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> output: array<vec4f>;

const WIDTH = 2048u;
const CALLS = 1u;

fn thread_count() -> u32 {
  return params.count;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.count) { return; }
  rng_begin(id.x, params.frame);
  let u = rand4(0u);
  rng_end();
  let keep = select(vec4f(0.0), vec4f(1.0 / (1.0 - params.p)), u >= vec4f(params.p));
  output[id.x] = input[id.x] * keep;
}

// The input: smooth stripes and rings, so the dropped elements show.
@compute @workgroup_size(256)
fn place(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.count) { return; }
  var v: vec4f;
  for (var j = 0u; j < 4u; j++) {
    let e = id.x * 4u + j;
    let p = vec2f(f32(e % WIDTH), f32(e / WIDTH)) / f32(WIDTH) - 0.5;
    v[j] = 0.5 + 0.5 * cos(40.0 * length(p)) * cos(12.0 * p.x);
  }
  input[id.x] = v;
}
