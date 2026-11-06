// Threefry-4x32 (Salmon, Moraes, Dror and Shaw, SC11), after Random123's threefry.h: Threefish's
// add-rotate-xor rounds on four 32-bit words with the tweak dropped, a key injection every four
// rounds, and the rotation constants R_32x4 from that header. Checked against Random123's
// kat_vectors for 13 and 20 rounds (tests/wgsl-rng.html).
//
// threefry4x32 is the loop, as the reference; the generators use threefry4x32_12 and _20, the same
// rounds written out with constant rotations and key indices (the tests check they agree with the
// loop). With the loop the rotations are looked up at run time, and on the pi kernel (M1 Pro,
// headless Chrome, one run each) Threefry-12 made 2.2K steps/s; written out, 13.4K.

const TF_ROT0 = array<u32, 8>(10u, 11u, 13u, 23u, 6u, 17u, 25u, 18u);
const TF_ROT1 = array<u32, 8>(26u, 21u, 27u, 5u, 20u, 11u, 10u, 20u);
const SKEIN_KS_PARITY32 = 0x1BD11BDAu;

fn threefry4x32(ctr: vec4u, key: vec4u, rounds: u32) -> vec4u {
  let rot0 = TF_ROT0;
  let rot1 = TF_ROT1;
  var ks = array<u32, 5>(key.x, key.y, key.z, key.w, SKEIN_KS_PARITY32 ^ key.x ^ key.y ^ key.z ^ key.w);
  var x = ctr + key;
  for (var r = 0u; r < rounds; r++) {
    let a = rot0[r % 8u];
    let b = rot1[r % 8u];
    if (r % 2u == 0u) {
      x.x += x.y; x.y = rotl32(x.y, a) ^ x.x;
      x.z += x.w; x.w = rotl32(x.w, b) ^ x.z;
    } else {
      x.x += x.w; x.w = rotl32(x.w, a) ^ x.x;
      x.z += x.y; x.y = rotl32(x.y, b) ^ x.z;
    }
    if (r % 4u == 3u) {
      let s = (r + 1u) / 4u;
      x += vec4u(ks[s % 5u], ks[(s + 1u) % 5u], ks[(s + 2u) % 5u], ks[(s + 3u) % 5u]);
      x.w += s;
    }
  }
  return x;
}

// Written out by a script from threefry4x32 above: round r rotates by TF_ROT0[r % 8] and
// TF_ROT1[r % 8], and every fourth round injects key schedule word s = (r + 1) / 4.
fn threefry4x32_12(ctr: vec4u, key: vec4u) -> vec4u {
  let ks = array<u32, 5>(key.x, key.y, key.z, key.w, SKEIN_KS_PARITY32 ^ key.x ^ key.y ^ key.z ^ key.w);
  var x = ctr + key;
  x.x += x.y; x.y = rotl32(x.y, 10u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 26u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 11u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 21u) ^ x.z;
  x.x += x.y; x.y = rotl32(x.y, 13u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 27u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 23u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 5u) ^ x.z;
  x += vec4u(ks[1], ks[2], ks[3], ks[4]); x.w += 1u;
  x.x += x.y; x.y = rotl32(x.y, 6u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 20u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 17u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 11u) ^ x.z;
  x.x += x.y; x.y = rotl32(x.y, 25u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 10u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 18u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 20u) ^ x.z;
  x += vec4u(ks[2], ks[3], ks[4], ks[0]); x.w += 2u;
  x.x += x.y; x.y = rotl32(x.y, 10u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 26u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 11u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 21u) ^ x.z;
  x.x += x.y; x.y = rotl32(x.y, 13u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 27u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 23u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 5u) ^ x.z;
  x += vec4u(ks[3], ks[4], ks[0], ks[1]); x.w += 3u;
  return x;
}

fn threefry4x32_20(ctr: vec4u, key: vec4u) -> vec4u {
  let ks = array<u32, 5>(key.x, key.y, key.z, key.w, SKEIN_KS_PARITY32 ^ key.x ^ key.y ^ key.z ^ key.w);
  var x = ctr + key;
  x.x += x.y; x.y = rotl32(x.y, 10u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 26u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 11u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 21u) ^ x.z;
  x.x += x.y; x.y = rotl32(x.y, 13u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 27u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 23u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 5u) ^ x.z;
  x += vec4u(ks[1], ks[2], ks[3], ks[4]); x.w += 1u;
  x.x += x.y; x.y = rotl32(x.y, 6u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 20u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 17u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 11u) ^ x.z;
  x.x += x.y; x.y = rotl32(x.y, 25u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 10u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 18u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 20u) ^ x.z;
  x += vec4u(ks[2], ks[3], ks[4], ks[0]); x.w += 2u;
  x.x += x.y; x.y = rotl32(x.y, 10u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 26u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 11u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 21u) ^ x.z;
  x.x += x.y; x.y = rotl32(x.y, 13u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 27u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 23u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 5u) ^ x.z;
  x += vec4u(ks[3], ks[4], ks[0], ks[1]); x.w += 3u;
  x.x += x.y; x.y = rotl32(x.y, 6u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 20u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 17u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 11u) ^ x.z;
  x.x += x.y; x.y = rotl32(x.y, 25u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 10u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 18u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 20u) ^ x.z;
  x += vec4u(ks[4], ks[0], ks[1], ks[2]); x.w += 4u;
  x.x += x.y; x.y = rotl32(x.y, 10u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 26u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 11u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 21u) ^ x.z;
  x.x += x.y; x.y = rotl32(x.y, 13u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, 27u) ^ x.z;
  x.x += x.w; x.w = rotl32(x.w, 23u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, 5u) ^ x.z;
  x += vec4u(ks[0], ks[1], ks[2], ks[3]); x.w += 5u;
  return x;
}
