// xxhash32, a 4 -> 1 hash: four calls, one per word, the last input word numbering them.
fn rand4u(call: u32) -> vec4u {
  let n = draw_index(call);
  return vec4u(
    xxhash32(vec4u(rng_thread, n, params.seed, 0u)),
    xxhash32(vec4u(rng_thread, n, params.seed, 1u)),
    xxhash32(vec4u(rng_thread, n, params.seed, 2u)),
    xxhash32(vec4u(rng_thread, n, params.seed, 3u)),
  );
}
