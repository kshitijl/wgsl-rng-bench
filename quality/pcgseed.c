// PCG32 seeding variants, laid out like the benchmark (2^20 threads, 4 words each per frame).
#include <stdio.h>
#include <string.h>
#include "rngs.h"
static u64 h64(u32 t, u32 which) { u32 c[4] = {t, which, 0, 0}, k[2] = {SEED, 0x9C632u}, o[4]; philox(c, k, o); return o[0] | (u64)o[1] << 32; }
static void advance(Pcg32 *r, u64 d) {
  u64 cm = 6364136223846793005ULL, cp = r->inc, am = 1, ap = 0;
  while (d) { if (d & 1) { am *= cm; ap = ap * cm + cp; } cp = (cm + 1) * cp; cm *= cm; d >>= 1; }
  r->state = am * r->state + ap;
}
int main(int argc, char **argv) {
  u32 T = 1u << 20; Pcg32 *x = malloc(sizeof *x * T); const char *v = argv[1];
  for (u32 t = 0; t < T; t++) {
    if (!strcmp(v, "current")) x[t] = pcg32_seeded(SEED, t);                 // what the benchmark does
    else if (!strcmp(v, "hashstate")) x[t] = pcg32_seeded(h64(t, 0), t);     // hashed start, increments 2t+1
    else if (!strcmp(v, "hashboth")) x[t] = pcg32_seeded(h64(t, 0), h64(t, 1)); // hashed start and increment
    else if (!strcmp(v, "onestream")) x[t] = pcg32_seeded(h64(t, 0), 0);     // one shared stream, hashed starts
    else if (!strcmp(v, "skip")) { x[t] = pcg32_seeded(SEED, 0); advance(&x[t], (u64)t << 44); } // cuRAND-style: thread t at t*2^44
    else return 2;
  }
  u32 *buf = malloc(16 * (size_t)T);
  for (;;) { for (u32 t = 0; t < T; t++) for (int j = 0; j < 4; j++) buf[4*t+j] = pcg32_next(&x[t]);
    if (fwrite(buf, 4, 4 * (size_t)T, stdout) != 4 * (size_t)T) return 0; }
}
