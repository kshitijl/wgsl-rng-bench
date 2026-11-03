// PCG32 (O'Neill), after pcg_basic.c: a 64-bit LCG state and an odd increment that picks the
// stream, with the XSH RR output permutation. WGSL has no 64-bit integers, so the state is two
// words and the multiply is built from 32-bit pieces (mulhi from ../gpu-rng/philox.wgsl). Checked
// against pcg_basic.c (tests/wgsl-rng.html).

struct Pcg32 {
  state: vec2u, // low word, high word
  inc: vec2u,
}

struct Pcg32Step {
  rng: Pcg32,
  out: u32,
}

const PCG_MULT = vec2u(0x4C957F2Du, 0x5851F42Du); // 6364136223846793005

fn add64(a: vec2u, b: vec2u) -> vec2u {
  let lo = a.x + b.x;
  return vec2u(lo, a.y + b.y + select(0u, 1u, lo < a.x));
}

// The low 64 bits of a * b.
fn mul64(a: vec2u, b: vec2u) -> vec2u {
  return vec2u(a.x * b.x, mulhi(a.x, b.x) + a.x * b.y + a.y * b.x);
}

// a >> k for 0 < k < 32.
fn shr64(a: vec2u, k: u32) -> vec2u {
  return vec2u((a.x >> k) | (a.y << (32u - k)), a.y >> k);
}

fn pcg32_next(rng: Pcg32) -> Pcg32Step {
  let old = rng.state;
  let next = Pcg32(add64(mul64(old, PCG_MULT), rng.inc), rng.inc);
  // xorshifted = ((old >> 18) ^ old) >> 27, truncated to 32 bits.
  let mixed = shr64(old, 18u) ^ old;
  let xorshifted = (mixed.x >> 27u) | (mixed.y << 5u);
  let rot = old.y >> 27u;
  return Pcg32Step(next, (xorshifted >> rot) | (xorshifted << ((32u - rot) & 31u)));
}

// pcg32_srandom_r(initstate, initseq).
fn pcg32_seeded(initstate: vec2u, initseq: vec2u) -> Pcg32 {
  let inc = vec2u((initseq.x << 1u) | 1u, (initseq.y << 1u) | (initseq.x >> 31u));
  var rng = pcg32_next(Pcg32(vec2u(0u), inc)).rng;
  rng.state = add64(rng.state, initstate);
  return pcg32_next(rng).rng;
}
