// Hashes used as counter-based generators in shaders, from Jarzynski and Olano, "Hash Functions
// for GPU Rendering" (JCGT 9(3), 2020) and its supplement, ported from their HLSL listings.
// Checked against those listings run in C (tests/wgsl-rng.html).

// pcg4d (4 -> 4): their own, after O'Neill's PCG; 0 BigCrush failures in their tests.
fn pcg4d(v_in: vec4u) -> vec4u {
  var v = v_in * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> vec4u(16u);
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}

// xxhash32 (4 -> 1, multibyte), after Collet's xxHash: one word from four.
fn xxhash32(p: vec4u) -> u32 {
  const PRIME32_2 = 2246822519u;
  const PRIME32_3 = 3266489917u;
  const PRIME32_4 = 668265263u;
  const PRIME32_5 = 374761393u;
  var h32 = p.w + PRIME32_5 + p.x * PRIME32_3;
  h32 = PRIME32_4 * rotl32(h32, 17u);
  h32 += p.y * PRIME32_3;
  h32 = PRIME32_4 * rotl32(h32, 17u);
  h32 += p.z * PRIME32_3;
  h32 = PRIME32_4 * rotl32(h32, 17u);
  h32 = PRIME32_2 * (h32 ^ (h32 >> 15u));
  h32 = PRIME32_3 * (h32 ^ (h32 >> 13u));
  return h32 ^ (h32 >> 16u);
}

// TEA, Wheeler and Needham's Tiny Encryption Algorithm, for `cycles` cycles (two Feistel rounds
// each; the cipher uses 32). With key 0 this is the supplement's tea(p, rounds).
fn tea(v: vec2u, key: vec4u, cycles: u32) -> vec2u {
  var p = v;
  var s = 0u;
  for (var i = 0u; i < cycles; i++) {
    s += 0x9E3779B9u;
    p.x += ((p.y << 4u) + key.x) ^ (p.y + s) ^ ((p.y >> 5u) + key.y);
    p.y += ((p.x << 4u) + key.z) ^ (p.x + s) ^ ((p.x >> 5u) + key.w);
  }
  return p;
}
