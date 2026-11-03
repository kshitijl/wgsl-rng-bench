// The post's path tracer (../gpu-rng/trace.wgsl) as one thread per pixel, for any generator: one
// sample per pixel per frame.
fn thread_count() -> u32 {
  return params.width * params.height;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= thread_count()) { return; }
  rng_begin(id.x, params.frame);
  add_sample(id.x, trace(vec2u(id.x % params.width, id.x / params.width)));
  rng_end();
}
