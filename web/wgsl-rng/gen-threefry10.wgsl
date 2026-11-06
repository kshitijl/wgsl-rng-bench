// Threefry-4x32-10, counter-based: one call gives four words.
fn rand4u(call: u32) -> vec4u {
  return threefry4x32_10(vec4u(draw_index(call), 0u, rng_thread, 0u), vec4u(params.seed, 0u, 0u, 0u));
}
