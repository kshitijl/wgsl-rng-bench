// XORWOW, cuRAND's default generator: Marsaglia's xorwow (Xorshift RNGs, Journal of Statistical
// Software 8(14), 2003), five words of xorshift state plus a Weyl sequence d. Shared by
// rng-xorwow.wgsl (pi, ink) and xorwow.wgsl (the path tracer). Needs philox.wgsl for seeding.

struct XorwowState {
  x: u32,
  y: u32,
  z: u32,
  w: u32,
  v: u32,
  d: u32,
}

// The next state; its output is xorwow_out(next).
fn xorwow_step(s: XorwowState) -> XorwowState {
  let t = s.x ^ (s.x >> 2u);
  let v = (s.v ^ (s.v << 4u)) ^ (t ^ (t << 1u));
  return XorwowState(s.y, s.z, s.w, s.v, v, s.d + 362437u);
}

fn xorwow_out(s: XorwowState) -> u32 {
  return s.d + s.v;
}

// Generator `n`'s state, from its own seed: cuRAND's quick way to set up many generators is a
// different seed per thread, at subsequence 0. cuRAND derives the words from the seed its own way;
// this hashes (n, seed) with Philox, mixed with Marsaglia's start values. (All-zero xorshift words
// would stay zero forever; the odds of that are 2^-160.)
fn xorwow_seeded(n: u32, seed: u32) -> XorwowState {
  let a = philox4x32_10(vec4u(n, 0u, 0u, 0u), vec2u(seed, 0x30A30Au));
  let b = philox4x32_10(vec4u(n, 1u, 0u, 0u), vec2u(seed, 0x30A30Au));
  return XorwowState(a.x ^ 123456789u, a.y ^ 362436069u, a.z ^ 521288629u, a.w ^ 88675123u, b.x ^ 5783321u, b.y ^ 6615241u);
}
