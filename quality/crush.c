// Runs a TestU01 battery on one generator's stream (rngs.h: frame after frame, every thread's
// four words). `crush GEN small|crush|big [THREADS]`. Build: see README.md.
#include <stdio.h>
#include <string.h>
#include "rngs.h"
#include "unif01.h"
#include "bbattery.h"

static Stream s;
static u32 *buf;
static size_t at, len;

static unsigned int next_bits(void) {
  if (at == len) { stream_frame(&s, buf); at = 0; }
  return buf[at++];
}

int main(int argc, char **argv) {
  if (argc < 3 || gen_by_id(argv[1]) < 0) { fprintf(stderr, "usage: crush GEN small|crush|big [THREADS]\n"); return 2; }
  u32 threads = argc > 3 ? (u32)strtoul(argv[3], 0, 0) : 1u << 20;
  stream_init(&s, gen_by_id(argv[1]), threads);
  len = 4 * (size_t)threads;
  at = len;
  buf = malloc(sizeof(u32) * len);
  char name[64];
  snprintf(name, sizeof name, "%s, %u threads", argv[1], threads);
  unif01_Gen *gen = unif01_CreateExternGenBits(name, next_bits);
  if (!strcmp(argv[2], "small")) bbattery_SmallCrush(gen);
  else if (!strcmp(argv[2], "crush")) bbattery_Crush(gen);
  else bbattery_BigCrush(gen);
  return 0;
}
