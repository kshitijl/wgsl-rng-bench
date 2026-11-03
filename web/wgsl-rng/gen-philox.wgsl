// Philox4x32-10, counter-based: one call gives four words. Same counter layout as the post's
// stateless demo (../gpu-rng/rng-stateless.wgsl).
fn rand4u(call: u32) -> vec4u {
  return philox4x32_10(vec4u(draw_index(call), 0u, rng_thread, 0u), vec2u(params.seed, 0u));
}
