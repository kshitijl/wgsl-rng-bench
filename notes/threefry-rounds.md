# Threefry's round count: is there a Threefry as fast as pcg4d that passes? (Nov 6, 2026)

The question, the user's: pcg4d is the fastest generator in the benchmark but fails PractRand at
128 MB; Threefry4x32-12 is the fastest clean one, about 18% slower. Would fewer rounds make a
Threefry that is both as fast as pcg4d and clean? "if there's none, i'm happy to recommend
threefry-12. but if there is one, it's worth running the tests to figure it out."

**Answer: no.** Threefry draws level with pcg4d at about 5 rounds, and 4, 5 and 6 rounds all fail
PractRand within the first 512 MB. Threefry-12 stays the post's recommendation. The post says so
(the user's words, in the site repo's `wgsl-rng-benchmark.mdx`).

## What was done, in order

1. **Threefry-10's statistical tests.** Added to the C ports (`quality/rngs.h`, `threefry10`).
   It passes BigCrush (all 160 statistics) and PractRand to 1 TB in the benchmark's layout, so 10
   rounds already pass and Threefry-12 has at least two rounds to spare by these tests.
   Logs: `quality/results/*-threefry10.txt`. Commits 04b28de, 4387090.
2. **Threefry-10 in the GPU benchmark.** Added as a tenth generator (commit 1080e21), checked
   against the C port (PASS), two runs in headless Chrome 156 on the M1 Pro. 4% faster than
   Threefry-12 and 12% slower than pcg4d (geometric mean over the seven workloads; 30% slower on
   pi). Taken out again afterwards (the user: the post doesn't feature it, and the site's
   benchmark should match the post's nine). Raw runs: `threefry-rounds/threefry10-chrome-run*.json`.
3. **The round sweep.** Threefry with 1 to 12 rounds, written out, benchmarked next to pcg4d (two
   runs, headless Chrome 156, M1 Pro). Speed relative to pcg4d, above 1 faster:

   | rounds | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
   |---|---|---|---|---|---|---|---|---|---|---|
   | mean of 7 workloads | 1.01 | 1.03 | 1.00 | 0.97 | 0.94 | 0.92 | 0.90 | 0.88 | 0.86 | 0.84 |
   | pi | 1.03 | 1.02 | 0.97 | 0.91 | 0.84 | 0.80 | 0.74 | 0.70 | 0.66 | 0.63 |

   Runs differed by up to 6% in a cell. Below 4 rounds the numbers mean little (Ising and Gauss
   slow down by up to half, likely from the poor output changing the workloads). Ising, dropout
   and raw run at the same speed whatever the counter-based RNG. Commit a3c8ece; raw runs:
   `threefry-rounds/sweep-chrome-run*.json`; to rerun, `threefry-rounds/make-sweep.py` (its
   docstring says how).
4. **Threefry-4, -5, -6's tests.** In `rngs.h` as `threefry4`, `threefry5`, `threefry6`. PractRand
   in the benchmark's layout fails all three at its first report, 512 MB, about 3 s in (78, 106
   and 139 FAIL lines; p down to 5e-8505 for 6 rounds, 0 for 5 and 4). Stopped there; BigCrush
   wasn't run. Logs: `quality/results/practrand-threefry{4,5,6}.txt`. Commit 418ef45.
5. **`quality/build-testers.sh`**, so the tests can be rerun without rebuilding TestU01 and
   PractRand by hand (both earlier builds were in scratch folders and vanished). See
   `quality/README.md`. Commit 418ef45.

## What's kept and what isn't

- Kept: the C ports of Threefry-10, -6, -5, -4 and their logs; `all.js` showing only generators
  that every run in the picked source has (made for Threefry-10; it keeps any generator added
  later from being averaged over fewer runs than the others).
- Removed from the browser benchmark: `threefry4x32_10`, `gen-threefry10.wgsl` and its tests.
  Restore from commit 1080e21 (`git show 1080e21 -- web tests`) if wanted.

## Open, if this is picked up again

- **Other hardware.** The sweep ran only in Chrome on the M1 Pro. On the iPhone (Nov 3 runs)
  Threefry-12 vs pcg4d is about the same gap, but Firefox, an NVIDIA desktop or Android could
  move the crossover. If on some GPU it moves above 6 rounds, the fewest clean rounds matters:
  it's somewhere in 7-10, since 7, 8 and 9 were never tested (slower than pcg4d on the M1, so
  moot there). `rngs.h` takes another round count by adding an enum entry (see `THREEFRY6`).
- **A faster Threefry.** The post says an optimization may have been missed. The rounds are
  already written out with constant rotations (2.2K vs 13.4K pi steps/s against the loop); each
  round costs about 3-4 µs of a pi step on the M1 in Chrome (Threefry-12: about 75 µs a step).
- **Threefry-6, -5, -4 on BigCrush**: not needed for the answer (they fail PractRand at once).
- **The build fixes upstream.** TestU01's `config.sub` predates Apple Silicon; a PR to
  `umontreal-simul/TestU01-2009` could fix it (see `quality/README.md`).
