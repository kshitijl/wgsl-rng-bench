// Writes a generator's output to stdout as raw 32-bit words, frame after frame (rngs.h), forever,
// for PractRand's `RNG_test stdin32`. `stream GEN [THREADS]`; `stream GEN THREADS --dump N` prints
// the first N words of frames 0 and 1 for threads 0..3 and THREADS-1, in hex, instead.
#include <stdio.h>
#include <string.h>
#include "rngs.h"

int main(int argc, char **argv) {
  if (argc < 2 || gen_by_id(argv[1]) < 0) { fprintf(stderr, "usage: stream GEN [THREADS] [--dump]\n"); return 2; }
  u32 threads = argc > 2 ? (u32)strtoul(argv[2], 0, 0) : 1u << 20;
  Stream s; stream_init(&s, gen_by_id(argv[1]), threads);
  u32 *buf = malloc(sizeof(u32) * 4 * (size_t)threads);
  if (argc > 3 && !strcmp(argv[3], "--dump")) {
    for (int f = 0; f < 2; f++) {
      stream_frame(&s, buf);
      u32 ts[5] = {0, 1, 2, 3, threads - 1};
      for (int i = 0; i < 5; i++) printf("f%d t%u %08x %08x %08x %08x\n", f, ts[i], buf[4*ts[i]], buf[4*ts[i]+1], buf[4*ts[i]+2], buf[4*ts[i]+3]);
    }
    return 0;
  }
  for (;;) {
    stream_frame(&s, buf);
    if (fwrite(buf, sizeof(u32), 4 * (size_t)threads, stdout) != 4 * (size_t)threads) return 0;
  }
}
