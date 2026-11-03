// Philox4x32-10 (Salmon, Moraes, Dror and Shaw, "Parallel Random Numbers: As Easy as 1, 2, 3",
// SC11): a keyed bijection on 128-bit counters. Same rounds and constants as Random123 and cuRAND.

const PHILOX_M0 = 0xD2511F53u;
const PHILOX_M1 = 0xCD9E8D57u;
const PHILOX_W0 = 0x9E3779B9u;
const PHILOX_W1 = 0xBB67AE85u;

// The high 32 bits of the 64-bit product a * b. WGSL has no 64-bit integers, so multiply 16-bit
// halves.
fn mulhi(a: u32, b: u32) -> u32 {
  let a_lo = a & 0xFFFFu;
  let a_hi = a >> 16u;
  let b_lo = b & 0xFFFFu;
  let b_hi = b >> 16u;
  let lo_lo = a_lo * b_lo;
  let hi_lo = a_hi * b_lo;
  let lo_hi = a_lo * b_hi;
  let hi_hi = a_hi * b_hi;
  let cross = (lo_lo >> 16u) + (hi_lo & 0xFFFFu) + lo_hi;
  return hi_hi + (hi_lo >> 16u) + (cross >> 16u);
}

fn philox_round(ctr: vec4u, key: vec2u) -> vec4u {
  let hi0 = mulhi(PHILOX_M0, ctr.x);
  let lo0 = PHILOX_M0 * ctr.x;
  let hi1 = mulhi(PHILOX_M1, ctr.z);
  let lo1 = PHILOX_M1 * ctr.z;
  return vec4u(hi1 ^ ctr.y ^ key.x, lo1, hi0 ^ ctr.w ^ key.y, lo0);
}

fn philox4x32_10(counter: vec4u, key_in: vec2u) -> vec4u {
  var ctr = counter;
  var key = key_in;
  for (var i = 0u; i < 9u; i++) {
    ctr = philox_round(ctr, key);
    key += vec2u(PHILOX_W0, PHILOX_W1);
  }
  return philox_round(ctr, key);
}

// Four uniform floats in [0, 1), from the top 24 bits of each word.
fn to_unit_floats(bits: vec4u) -> vec4f {
  return vec4f(bits >> vec4u(8u)) * (1.0 / 16777216.0);
}
