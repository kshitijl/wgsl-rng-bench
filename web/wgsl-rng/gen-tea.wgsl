// TEA with 6 cycles (the supplement's tea), keyed by the seed: two calls of two words each.
fn rand4u(call: u32) -> vec4u {
  let n = draw_index(call);
  let key = vec4u(params.seed, 0u, 0u, 0u);
  return vec4u(tea(vec2u(rng_thread, 2u * n), key, 6u), tea(vec2u(rng_thread, 2u * n + 1u), key, 6u));
}
