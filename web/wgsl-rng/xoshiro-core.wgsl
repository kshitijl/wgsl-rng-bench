// xoshiro128** 1.1 (Blackman and Vigna), after their xoshiro128starstar.c: four words of state.
// Checked against that C (tests/wgsl-rng.html).

struct Xoshiro128 {
  s: vec4u,
}

struct XoshiroStep {
  state: Xoshiro128,
  out: u32,
}

fn xoshiro128ss(st: Xoshiro128) -> XoshiroStep {
  var s = st.s;
  let result = rotl32(s.y * 5u, 7u) * 9u;
  let t = s.y << 9u;
  s.z ^= s.x;
  s.w ^= s.y;
  s.y ^= s.z;
  s.x ^= s.w;
  s.z ^= t;
  s.w = rotl32(s.w, 11u);
  return XoshiroStep(Xoshiro128(s), result);
}
