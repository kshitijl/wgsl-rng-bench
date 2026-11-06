// C ports of the ten WGSL generators in klauria.tech's public/demos/wgsl-rng (and
// ../gpu-rng/philox.wgsl, xorwow-core.wgsl), word for word, laid out as the benchmark uses them:
// thread t of T, frame n, seed SEED, one rand4u per thread per frame (CALLS = 1). A "frame" of
// output is all T threads' four words, thread 0 first: frame_words(g, n) fills 4T words.
// Checked against the GPU's output: tests/wgsl-rng.html compares words from the raw kernel with
// `stream GEN 1048576 --dump`.
#pragma once
#include <stdint.h>
#include <stdlib.h>

typedef uint32_t u32;
typedef uint64_t u64;
#define SEED 1u

static inline u32 rotl32(u32 x, u32 k) { return (x << k) | (x >> (32u - k)); }

// Philox4x32-10, after philox.wgsl.
static inline void philox(const u32 c_in[4], const u32 k_in[2], u32 out[4]) {
  u32 c0 = c_in[0], c1 = c_in[1], c2 = c_in[2], c3 = c_in[3], k0 = k_in[0], k1 = k_in[1];
  for (int i = 0; i < 10; i++) {
    u64 p0 = (u64)0xD2511F53u * c0, p1 = (u64)0xCD9E8D57u * c2;
    u32 n0 = (u32)(p1 >> 32) ^ c1 ^ k0, n1 = (u32)p1, n2 = (u32)(p0 >> 32) ^ c3 ^ k1, n3 = (u32)p0;
    c0 = n0; c1 = n1; c2 = n2; c3 = n3;
    k0 += 0x9E3779B9u; k1 += 0xBB67AE85u;
  }
  out[0] = c0; out[1] = c1; out[2] = c2; out[3] = c3;
}

// Threefry4x32, after threefry.wgsl (the loop; the WGSL generators use it written out).
static inline void threefry(const u32 ctr[4], const u32 key[4], int rounds, u32 out[4]) {
  static const u32 R0[8] = {10, 11, 13, 23, 6, 17, 25, 18}, R1[8] = {26, 21, 27, 5, 20, 11, 10, 20};
  u32 ks[5] = {key[0], key[1], key[2], key[3], 0x1BD11BDAu ^ key[0] ^ key[1] ^ key[2] ^ key[3]};
  u32 x[4] = {ctr[0] + key[0], ctr[1] + key[1], ctr[2] + key[2], ctr[3] + key[3]};
  for (int r = 0; r < rounds; r++) {
    u32 a = R0[r % 8], b = R1[r % 8];
    if (r % 2 == 0) { x[0] += x[1]; x[1] = rotl32(x[1], a) ^ x[0]; x[2] += x[3]; x[3] = rotl32(x[3], b) ^ x[2]; }
    else { x[0] += x[3]; x[3] = rotl32(x[3], a) ^ x[0]; x[2] += x[1]; x[1] = rotl32(x[1], b) ^ x[2]; }
    if (r % 4 == 3) {
      u32 s = (r + 1) / 4;
      for (int i = 0; i < 4; i++) x[i] += ks[(s + i) % 5];
      x[3] += s;
    }
  }
  for (int i = 0; i < 4; i++) out[i] = x[i];
}

static inline void pcg4d(const u32 in[4], u32 v[4]) {
  for (int i = 0; i < 4; i++) v[i] = in[i] * 1664525u + 1013904223u;
  v[0] += v[1] * v[3]; v[1] += v[2] * v[0]; v[2] += v[0] * v[1]; v[3] += v[1] * v[2];
  for (int i = 0; i < 4; i++) v[i] ^= v[i] >> 16;
  v[0] += v[1] * v[3]; v[1] += v[2] * v[0]; v[2] += v[0] * v[1]; v[3] += v[1] * v[2];
}

static inline u32 xxhash32(u32 x, u32 y, u32 z, u32 w) {
  const u32 P2 = 2246822519u, P3 = 3266489917u, P4 = 668265263u, P5 = 374761393u;
  u32 h = w + P5 + x * P3;
  h = P4 * rotl32(h, 17); h += y * P3;
  h = P4 * rotl32(h, 17); h += z * P3;
  h = P4 * rotl32(h, 17);
  h = P2 * (h ^ (h >> 15)); h = P3 * (h ^ (h >> 13));
  return h ^ (h >> 16);
}

static inline void tea(u32 p0, u32 p1, const u32 k[4], int cycles, u32 out[2]) {
  u32 s = 0;
  for (int i = 0; i < cycles; i++) {
    s += 0x9E3779B9u;
    p0 += ((p1 << 4) + k[0]) ^ (p1 + s) ^ ((p1 >> 5) + k[1]);
    p1 += ((p0 << 4) + k[2]) ^ (p0 + s) ^ ((p0 >> 5) + k[3]);
  }
  out[0] = p0; out[1] = p1;
}

typedef struct { u32 x, y, z, w, v, d; } Xorwow;
typedef struct { u32 s[4]; } Xoshiro;
typedef struct { u64 state, inc; } Pcg32;

static inline u32 xorwow_next(Xorwow *s) {
  u32 t = s->x ^ (s->x >> 2);
  u32 v = (s->v ^ (s->v << 4)) ^ (t ^ (t << 1));
  s->x = s->y; s->y = s->z; s->z = s->w; s->w = s->v; s->v = v; s->d += 362437u;
  return s->d + s->v;
}
static inline Xorwow xorwow_seeded(u32 n, u32 seed) {
  u32 k[2] = {seed, 0x30A30Au}, c[4] = {n, 0, 0, 0}, a[4], b[4];
  philox(c, k, a); c[1] = 1; philox(c, k, b);
  return (Xorwow){a[0] ^ 123456789u, a[1] ^ 362436069u, a[2] ^ 521288629u, a[3] ^ 88675123u, b[0] ^ 5783321u, b[1] ^ 6615241u};
}
static inline u32 xoshiro_next(Xoshiro *st) {
  u32 *s = st->s;
  u32 result = rotl32(s[1] * 5, 7) * 9, t = s[1] << 9;
  s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl32(s[3], 11);
  return result;
}
static inline Xoshiro xoshiro_seeded(u32 n, u32 seed) {
  u32 k[2] = {seed, 0x50517u}, c[4] = {n, 0, 0, 0};
  Xoshiro x; philox(c, k, x.s);
  if (!(x.s[0] | x.s[1] | x.s[2] | x.s[3])) x.s[0] = 1;
  return x;
}
static inline u32 pcg32_next(Pcg32 *r) {
  u64 old = r->state;
  r->state = old * 6364136223846793005ULL + r->inc;
  u32 xs = (u32)(((old >> 18) ^ old) >> 27), rot = (u32)(old >> 59);
  return (xs >> rot) | (xs << ((32u - rot) & 31u));
}
static inline Pcg32 pcg32_seeded(u64 initstate, u64 initseq) {
  Pcg32 r = {0, (initseq << 1) | 1};
  pcg32_next(&r); r.state += initstate; pcg32_next(&r);
  return r;
}

enum { PHILOX, THREEFRY20, THREEFRY12, THREEFRY10, PCG4D, XXHASH32, TEA, XORWOW, XOSHIRO, PCG32, NGEN };
static const char *GEN_IDS[NGEN] = {"philox", "threefry20", "threefry12", "threefry10", "pcg4d", "xxhash32", "tea", "xorwow", "xoshiro", "pcg32"};

typedef struct {
  int gen;
  u32 threads, frame;
  void *states; // per thread, for the stateful ones
} Stream;

static inline int gen_by_id(const char *id) {
  for (int g = 0; g < NGEN; g++) {
    const char *a = GEN_IDS[g], *b = id;
    while (*a && *a == *b) { a++; b++; }
    if (!*a && !*b) return g;
  }
  return -1;
}

static inline void stream_init(Stream *s, int gen, u32 threads) {
  s->gen = gen; s->threads = threads; s->frame = 0; s->states = NULL;
  if (gen == XORWOW) { Xorwow *x = malloc(sizeof *x * threads); for (u32 t = 0; t < threads; t++) x[t] = xorwow_seeded(t, SEED); s->states = x; }
  if (gen == XOSHIRO) { Xoshiro *x = malloc(sizeof *x * threads); for (u32 t = 0; t < threads; t++) x[t] = xoshiro_seeded(t, SEED); s->states = x; }
  if (gen == PCG32) { Pcg32 *x = malloc(sizeof *x * threads); for (u32 t = 0; t < threads; t++) { u32 c[4] = {t, 0, 0, 0}, k[2] = {SEED, 0x9C632u}, h[4]; philox(c, k, h); x[t] = pcg32_seeded(h[0] | (u64)h[1] << 32, t); } s->states = x; }
}

// Thread t's rand4u in the current frame.
static inline void rand4u(Stream *s, u32 t, u32 out[4]) {
  u32 n = s->frame;
  switch (s->gen) {
    case PHILOX: { u32 c[4] = {n, 0, t, 0}, k[2] = {SEED, 0}; philox(c, k, out); break; }
    case THREEFRY20: case THREEFRY12: case THREEFRY10: {
      u32 c[4] = {n, 0, t, 0}, k[4] = {SEED, 0, 0, 0};
      threefry(c, k, s->gen == THREEFRY20 ? 20 : s->gen == THREEFRY12 ? 12 : 10, out);
      break;
    }
    case PCG4D: { u32 in[4] = {t, n, SEED, 0}; pcg4d(in, out); break; }
    case XXHASH32: for (u32 j = 0; j < 4; j++) out[j] = xxhash32(t, n, SEED, j); break;
    case TEA: { u32 k[4] = {SEED, 0, 0, 0}; tea(t, 2 * n, k, 6, out); tea(t, 2 * n + 1, k, 6, out + 2); break; }
    case XORWOW: { Xorwow *x = (Xorwow *)s->states + t; for (int j = 0; j < 4; j++) out[j] = xorwow_next(x); break; }
    case XOSHIRO: { Xoshiro *x = (Xoshiro *)s->states + t; for (int j = 0; j < 4; j++) out[j] = xoshiro_next(x); break; }
    case PCG32: { Pcg32 *x = (Pcg32 *)s->states + t; for (int j = 0; j < 4; j++) out[j] = pcg32_next(x); break; }
  }
}

// One frame: every thread's four words, thread 0 first. buf holds 4 * threads words.
static inline void stream_frame(Stream *s, u32 *buf) {
  for (u32 t = 0; t < s->threads; t++) rand4u(s, t, buf + 4 * (size_t)t);
  s->frame++;
}
