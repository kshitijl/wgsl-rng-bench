# Statistical tests of the generators

Build (macOS, Nov 3, 2026):

- TestU01 1.2.3 from http://simul.iro.umontreal.ca/testu01/TestU01.zip:
  `./configure --prefix=$PWD/../install --build=x86_64-apple-darwin --host=x86_64-apple-darwin CFLAGS="-O2 -w -std=gnu89" && make -j8 && make install`
  (its config.sub doesn't know aarch64-apple-darwin; the compiler still builds for arm64).
- PractRand pre0.95 from https://downloads.sourceforge.net/project/pracrand/PractRand-pre0.95.zip:
  `c++ -O3 -std=c++14 -w -Iinclude src/*.cpp src/RNGs/*.cpp src/RNGs/other/*.cpp tools/RNG_test.cpp -o RNG_test -pthread`
- Here: `cc -O3 -march=native -o stream stream.c` and
  `cc -O3 -march=native -w -I$TU/include crush.c -o crush $TU/lib/libtestu01.a $TU/lib/libprobdist.a $TU/lib/libmylib.a -lm`.

Run: `RNG_TEST=/path/to/RNG_test ./run-all.sh` (BigCrush and PractRand to 1 TB on every generator, in
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

Nov 4, about 15:50: the user asked to unpause pcg4d (8235) and xxhash32 (8239); resumed with `kill -CONT`. Nothing is paused now.

Threefry-12 finished Nov 4 at 16:04 (8:52:04 CPU): it passes BigCrush. One of its 160 statistics,
test 49 (MaxOft AD, t = 32), is just outside TestU01's [0.001, 0.999] band at p = 7.9e-4. With 160
statistics there's a 27% chance (1 - 0.998^160) that at least one lands outside the band, and
7.9e-4 is far from a clear failure (p < 1e-10 or so), so this isn't one.

The pcg4d and xxhash32 runs died after the Nov 4 unpause, when an unrelated process ran the
laptop out of memory. Their logs stop at 25 of 106 tests. TestU01 can't resume a run, so both
restarted from the beginning on Nov 6 at 01:45, with the same `crush` binary and nice 19, each
under its own `caffeinate -i -w PID`. Both finished Nov 6 at 03:16 (about 1:32 CPU each) and fail
BigCrush, as their PractRand runs did: pcg4d 9 of 160 statistics outside the band (5 at eps),
xxhash32 10 (6 at eps or 1 - eps1).

## Threefry-10 (Nov 6)

The user asked, Nov 6, whether Threefry-10 had been tried (it hadn't; only 12 and 20), then to add
it and run its tests. Threefry-12 is the fewest rounds the GPU benchmark uses. Threefry-10 is the
same function with two rounds fewer, so it should show whether 12 rounds leave much margin.
`rngs.h` and `run-all.sh` have it as `threefry10`, laid out like Threefry-12: counter (frame, 0,
thread, 0), key (seed, 0, 0, 0). `stream` is rebuilt with it, and Threefry-12's first words are
unchanged (`0b292389 a5269211 c4142e7b 30fcd3be`, as in `tests/wgsl-rng.html`). The TestU01 and
PractRand builds of Nov 3 were gone (they were in a session's scratch folder), and building
downloaded code was blocked for the agent, so the user ran a script that rebuilt both (TestU01
from its authors' GitHub, `umontreal-simul/TestU01-2009`, as their site refused the download),
rebuilt `crush` and started Threefry-10's BigCrush and PractRand runs, Nov 6 about 13:04, under
`caffeinate`. At 13:11: PractRand clean to 32 GB, BigCrush 6 tests in, all normal.

Both finished Nov 6, PractRand at 14:54 and BigCrush at 15:13. Threefry-10 passes both:
PractRand has no failures and no "unusual" lines to 1 TB (6623 s), and BigCrush passes all 160
statistics ("All tests were passed"; smallest p-value 4.1e-3). Its BigCrush took 2:08:50 CPU,
not the 9 hours estimated from the Nov 4 runs, which were sharing the CPU. So 10 rounds already
pass both batteries in the benchmark's layout; 12 has at least two rounds of margin by these
tests.

The user then asked (Nov 6) to add it to the GPU benchmark, to see whether it's fast enough to
recommend over pcg4d. It is in `generators.js` as `threefry10` (`threefry4x32_10` in
`threefry.wgsl`; `tests/wgsl-rng.html` checks it against the loop and against this C port: PASS).
Two runs in headless Chrome 156 on the M1 Pro, Nov 6 about 16:55, machine otherwise idle; the
two agree within 1% on every workload, and the other generators are within 1-4% of the Nov 3
Chrome runs. Steps per second:

| | pi | ink | trace | Ising | dropout | Gauss | raw |
|---|---|---|---|---|---|---|---|
| pcg4d | 20.9K | 13.7K | 2194 | 2823 | 7501 | 12.2K | 12.3K |
| Threefry-10 | 14.6K | 11.0K | 1978 | 2821 | 7416 | 10.0K | 12.3K |
| Threefry-12 | 13.3K | 10.0K | 1902 | 2822 | 7435 | 9.4K | 12.1K |

Threefry-10 is 4% faster than Threefry-12 (geometric mean over workloads; up to 10% on pi) and
12% slower than pcg4d (30% on pi, 20% on ink, 18% on Gauss). Ising, dropout and raw run at the
same speed with every counter-based generator, so the RNG isn't what limits them. So two fewer
rounds close only about a quarter of the gap to pcg4d.

Then the user asked (Nov 6) whether any number of rounds makes Threefry faster than pcg4d ("if
there's none, i'm happy to recommend threefry-12. but if there is one, it's worth running the
tests"). The agent generated Threefry written out with 1 to 12 rounds (the same script reproduces
`threefry4x32_10` and `_12` exactly), in a scratch copy of `web/`, and ran two benchmark runs
(headless Chrome 156, M1 Pro, about 17:15) of those and pcg4d. Speed relative to pcg4d (above 1 is
faster), geometric mean over workloads, then pi alone:

| rounds | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|
| mean | 1.01 | 1.03 | 1.00 | 0.97 | 0.94 | 0.92 | 0.90 | 0.88 | 0.86 | 0.84 |
| pi | 1.03 | 1.02 | 0.97 | 0.91 | 0.84 | 0.80 | 0.74 | 0.70 | 0.66 | 0.63 |

The two runs differed by up to 6% in a cell this time (more generators per run). So Threefry
draws level with pcg4d at about 5 rounds and is slower with 6 or more. Below 4 rounds the numbers
mean little: Ising and Gauss slow down by up to half, likely because output that poor changes the
workloads themselves (atomics on the Gauss histogram colliding, for one).
Whether 4-6 rounds pass anything is untested: the TestU01 and PractRand builds were gone again.

## To do (Nov 6)

- Write
  `tools/build-testers.sh` (the user, Nov 6: "write the build script after the runs finish"):
  download TestU01 at a fixed commit of `umontreal-simul/TestU01-2009` and PractRand pre0.95 from
  SourceForge, check each against a recorded SHA-256, build both into a git-ignored folder in this
  repo (the commands at the top of this file), then build `crush` and `stream`. So the testers no
  longer live in a scratch folder that gets cleared. Chosen over publishing cleaned-up forks of
  both (the user asked, Nov 6): TestU01's repo takes pull requests and says a 64-bit version may
  come in late 2026, and unmaintained forks of both already exist. Build fixes (Apple Silicon in
  `config.sub`, the macOS `rm: conftest.dSYM` / `mkdir: .libs` noise) can go upstream as a PR.
  Check PractRand's license before redistributing anything of it.
