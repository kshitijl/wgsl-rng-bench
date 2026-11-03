// pcg4d, a 4 -> 4 hash: (thread, draw, seed, 0) in, four words out.
fn rand4u(call: u32) -> vec4u {
  return pcg4d(vec4u(rng_thread, draw_index(call), params.seed, 0u));
}
