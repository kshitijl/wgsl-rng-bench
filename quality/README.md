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
- PCG32 as first seeded (`pcg32_srandom_r(seed, thread)`; its files are `*-pcg32-srandom*`, see
  the next section) fails at 128 MB; one thread's stream is clean to 32 GB, so the failure is between
  streams: `pcg32_srandom_r(seed, thread)` gives every thread the same starting state and
  consecutive increments.
- xxhash32 fails at 1 GB (FPF, p about 1e-22), on one thread as well.
- Philox, both Threefrys, TEA-6, XORWOW and xoshiro128**: no anomalies at 32 GB.
- SmallCrush (same layout): PCG32 fails 6 statistics; XORWOW gave one marginal p = 8.2e-4 (of 15).

Interim (Nov 3, 20:50):
- PractRand: Philox, both Threefrys, TEA-6, XORWOW and xoshiro128** have no failures at 256 GB
  (each has at most two "unusual" lines over the run, p no smaller than 7e-6; with hundreds of
  tests per checkpoint, some are expected). PCG32 with hashed seeding: no failures at 128 GB, and
  one thread's stream clean to 64 GB (done).
- BigCrush: xxhash32 fails the first two tests (smultin_MultinomialOver on byte triples, from
  the top byte and from bits 22-29), p < 1e-300 each. Every other generator's visible p-values are
  ordinary. TestU01 writes in 4 KB chunks, so only the first 3-6 tests of each run are visible yet.

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
The first runs' PCG32 outputs, of the old seeding, are `bigcrush-pcg32-srandom.txt` (stopped by
the user partway, Nov 3: its result no longer mattered), `practrand-pcg32-srandom.txt` and
`practrand-pcg32-srandom-1thread.txt`.

## BigCrush runs paused (Nov 4)

At about 10:45 on Nov 4 the user asked to pause all but four BigCrush runs: they had reached
only 3-10 of 106 tests in 17 hours, sharing the CPU nine ways at nice 19 (about 41% of a core
each). Still running: Philox (pid 8225), Threefry-20 (8227), XORWOW (8246), xoshiro128** (8248),
now at 100% of a core each. Paused with `kill -STOP` (state `T` in `ps`; resume with
`kill -CONT PID`): Threefry-12 (8231), pcg4d (8235), xxhash32 (8239), TEA-6 (8243) and PCG32
hashed (23070, the `crush-new` binary). pcg4d and xxhash32 already fail PractRand, and xxhash32
fails BigCrush too, so those two runs matter least. A paused run's log stops growing; it isn't
hung. The `caffeinate` started on Nov 3 keeps the laptop awake while any `crush ... big` process
exists, paused ones included.

## BigCrush results, first four (Nov 4)

Finished Nov 4 between 12:15 and 13:27, about 2 hours after the other five were paused:
Philox, Threefry-20, XORWOW and xoshiro128** pass all of BigCrush (160 statistics each; TestU01's
summary: "All tests were passed"). Total CPU time: Philox 8:13:53, Threefry-20 9:21:16, XORWOW
8:16:14, xoshiro128** 8:11:28.

Where the time goes (Philox's log): tests 5 and 6, `smarsa_CollisionOver` with t = 3 on
16384^3 cells, took 2:28:47 and 4:02:57, about 6.5 of the 8.2 CPU-hours. The other 104 tests
took about 1.7 hours together. So progress by test count says little about time left: on Nov 4
the agent extrapolated from "6-10 of 106 tests done" to "days", when the runs were in fact about
80% through by CPU time.

Nov 4, about 14:05: the user asked to unpause three of the five. Resumed with `kill -CONT`:
Threefry-12 (8231), TEA-6 (8243) and PCG32 hashed (23070), the three that passed PractRand, so
their BigCrush result is still open. pcg4d (8235) and xxhash32 (8239) stay paused; both already
fail PractRand, and xxhash32 fails BigCrush.

Nov 4: TEA-6 (finished 15:36, 8:22:26 CPU) and PCG32 with hashed seeding (15:18, 7:38:47 CPU)
pass all of BigCrush, 160 statistics each ("All tests were passed").
