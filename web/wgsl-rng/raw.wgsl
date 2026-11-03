// Raw random words: each thread writes one rand4u (16 bytes) a frame. As close to the
// generator's own speed as a kernel gets, plus the store.

struct Params {
  count: u32, // threads
  frame: u32,
  seed: u32,
  pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> words: array<vec4u>;

const CALLS = 1u;

fn thread_count() -> u32 {
  return params.count;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.count) { return; }
  rng_begin(id.x, params.frame);
  words[id.x] = rand4u(0u);
  rng_end();
}
