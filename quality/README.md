# Statistical tests of the nine generators

Build (macOS, Nov 3, 2026):

- TestU01 1.2.3 from http://simul.iro.umontreal.ca/testu01/TestU01.zip:
  `./configure --prefix=$PWD/../install --build=x86_64-apple-darwin --host=x86_64-apple-darwin CFLAGS="-O2 -w -std=gnu89" && make -j8 && make install`
  (its config.sub doesn't know aarch64-apple-darwin; the compiler still builds for arm64).
- PractRand pre0.95 from https://downloads.sourceforge.net/project/pracrand/PractRand-pre0.95.zip:
  `c++ -O3 -std=c++14 -w -Iinclude src/*.cpp src/RNGs/*.cpp src/RNGs/other/*.cpp tools/RNG_test.cpp -o RNG_test -pthread`
- Here: `cc -O3 -march=native -o stream stream.c` and
  `cc -O3 -march=native -w -I$TU/include crush.c -o crush $TU/lib/libtestu01.a $TU/lib/libprobdist.a $TU/lib/libmylib.a -lm`.

Run: `RNG_TEST=/path/to/RNG_test ./run-all.sh` (BigCrush and PractRand to 1 TB on all nine, in
parallel, at low priority). One stream by hand: `./stream GEN | RNG_test stdin32 -tlmax 1TB`;
`./stream GEN 1` is one thread's own sequence; `./stream GEN 1048576 --dump` prints words to
compare with the GPU.

The stream is laid out as the benchmark uses the generators: frame after frame, every thread's
four words, thread 0 first (2^20 threads, seed 1). See `rngs.h`.

## Results

Started Nov 3, 2026 at 17:25 with `run-all.sh`, plus one-thread PractRand runs (to 64 GB) of the
three that failed early; output lands in `results/`, committed once the runs finish.

Interim (Nov 3, 18:00), PractRand, the benchmark's layout (2^20 threads):
- pcg4d fails at 128 MB, the first checkpoint, by huge margins (p = 0 on several tests); a single
  thread's own sequence (thread, n, seed, 0 with n climbing) fails at 128 MB too.
- PCG32 as first seeded (`pcg32_srandom_r(seed, thread)`; its files are to be renamed `*-pcg32-srandom*`, see
  the next section) fails at 128 MB; one thread's stream is clean to 32 GB, so the failure is between
  streams: `pcg32_srandom_r(seed, thread)` gives every thread the same starting state and
  consecutive increments.
- xxhash32 fails at 1 GB (FPF, p about 1e-22), on one thread as well.
- Philox, both Threefrys, TEA-6, XORWOW and xoshiro128**: no anomalies at 32 GB.
- SmallCrush (same layout): PCG32 fails 6 statistics; XORWOW gave one marginal p = 8.2e-4 (of 15).

## PCG32's seeding (Nov 3)

The user asked whether PCG32 can be used more correctly than the benchmark's
`pcg32_srandom_r(seed, thread)`, which gives every thread the same start and increments 1, 3, 5, ...
`pcgseed.c` (`cc -O3 -I. -o pcgseed pcgseed.c`, `./pcgseed VARIANT | RNG_test stdin32`) tries
five seedings in the benchmark's layout (2^20 threads, four words each per frame), PractRand to
8 GB, run Nov 3 while the full runs were going:

- `current`, the benchmark's: fails at 64 MB.
- `skip`, one shared stream with thread t jumped ahead t * 2^44 (like cuRAND's subsequences):
  fails at 64 MB (FPF, p = 4e-457 by 8 GB). A full-period LCG mod 2^64's low k bits have period
  2^k, so every thread's state has the same low 44 bits at every step.
- `hashstate` (start = Philox hash of the thread, increments 2t+1), `hashboth` (start and
  increment both hashed) and `onestream` (hashed starts, one shared increment): no anomalies at 8 GB.

So hashing each thread's start fixes it, as XORWOW and xoshiro128** already do with Philox. It
changes only the init pass, not the per-step cost. The benchmark has used `hashstate` since
Nov 3 (the user: yes to switching), in `gen-pcg32.wgsl` and `rngs.h`, checked against the GPU
by `tests/wgsl-rng.html` (PASS).

Its full runs started Nov 3 about 19:40, detached like the others, from binaries built in a
session's scratch folder (the repo's `quality/crush` and `stream` were still in use by the first
runs and were left alone; rebuild them once those finish): `results/bigcrush-pcg32-hashed.txt`,
`practrand-pcg32-hashed.txt` (to 1 TB) and `practrand-pcg32-hashed-1thread.txt` (to 64 GB).
The first runs' PCG32 outputs, `bigcrush-pcg32.txt`, `practrand-pcg32.txt` and
`practrand-pcg32-1thread.txt`, are the old seeding; rename them `*-pcg32-srandom*` once the
BigCrush one finishes or is stopped (it was still running; the agent wasn't allowed to stop it).
