# WGSL RNG benchmark

The user's project (started Nov 3, 2026): ten GPU random number generators written in WGSL,
benchmarked on seven workloads in the browser, and tested for statistical quality with BigCrush
and PractRand. Split out of the klauria.tech repo (`~/local-src/39-klauria-tech`) the same day
(the user: "this whole benchmarking project, along with the statistical testing, as well as the
C implementations that go with, should be in its own repo ... so it can be a separate github
repo and not clutter the website repo"). Public on GitHub since Nov 3: https://github.com/kshitijl/wgsl-rng-bench
(the README is only a link to the post, the user's call). The repo is public, so commits
carry no local paths (the history was rewritten once before the first push to remove one). The site's project page ("A benchmark of WGSL RNGs",
`src/content/pieces/wgsl-rng-benchmark.mdx` there) frames these pages; its prose is the user's.

In files the agent writes, the user is "the user" and the agent "the agent". The user writes all
prose that appears on the site; UI labels the agent adds are flagged to the user to rename.
Commit after every change.

## Layout

- `web/wgsl-rng/`: the pages and shaders. This is the source; `tools/sync-to-site.sh` copies it
  to the site's `public/demos/wgsl-rng/`, which is never edited there.
- `web/gpu-rng/`: copies of the files it uses from the site's GPU random numbers post
  (`public/demos/gpu-rng/`: Philox, the timing code, the pi, ink and path tracer kernels and
  views, `demo.css`). The site's copy is the source for these; `tools/vendor-gpu-rng.sh` refreshes
  them here. They're here so this repo runs on its own.
- `tests/wgsl-rng.html`: serve the repo root (`python3 -m http.server`) and open
  `/tests/wgsl-rng.html` in a browser with WebGPU; PASS or FAIL in the title.
- `quality/`: C ports of all ten generators (`rngs.h`, plus Threefry with 4-6 rounds), BigCrush
  (`crush.c`, TestU01) and PractRand (`stream.c` piped into `RNG_test stdin32`), and their output
  in `quality/results/`. `quality/build-testers.sh` builds TestU01 and PractRand into
  `quality/testers/` (git-ignored) and then `crush` and `stream`; `run-all.sh` uses them.
- `tools/collect.py`: serves `web/` (or the site's `public/`) and saves every run that
  `all.html?autorun=1` POSTs, for recording runs from several browsers on one machine.

## The generators and workloads

Ten generators (`generators.js`), the user's list (Nov 3: Philox, both Threefrys, XORWOW, "the
lcg hash" and two more of each family), plus Threefry-10 (Nov 6, the user: to see whether it
could be recommended over pcg4d for speed; `quality/README.md`). Counter-based: Philox4x32-10,
Threefry4x32-20, -12 and -10,
pcg4d (the JCGT 2020 hash, taken as "the lcg hash"), xxhash32 and TEA with 6 cycles (both from
the JCGT supplement); stateful: XORWOW, xoshiro128** and PCG32 (64-bit arithmetic emulated on
`vec2u`). Every generator defines `rng_begin`, `rand4u(call)` and `rng_end` (`common.wgsl` has the
contract); a stateful one also its states at binding 9 and an `init` pass. Counter-based ones
hash (thread, frame) as each `gen-*.wgsl` says; stateful ones seed per thread (XORWOW and
xoshiro128** from a Philox hash of the thread, PCG32 as `pcg32_srandom_r(h, thread)` with h a
Philox hash of the thread; the user, Nov 3, after `pcg32_srandom_r(seed, thread)` failed
PractRand at 64 MB from correlation between threads: see `quality/README.md`). Seeding is only
the init pass, so `results.json`'s PCG32 speeds, measured with the old seeding, still stand.

Seven workloads (`workloads.js`), one page each, `bench.html?w=<workload>`: pi, ink and the path
tracer reuse the post's kernels and views (`../gpu-rng/pi.js` and `ink.js` export `piDemo` and
`inkDemo`); ising (2D Ising at the critical temperature, checkerboard Metropolis), dropout,
gauss (Box-Muller, histogram against the exact density) and raw (random words). Threefry is
written out round by round (`threefry4x32_10`, `_12`, `_20`): as a loop with run-time rotation lookups,
Threefry-12 made 2.2K pi steps/s, written out 13.4K.

## The pages

Every bench page, like the post's demos, has two buttons (the user, Nov 3): "start" runs the
picture at once, at the benchmark's speed or a rough one from a short block timed on a copy;
"benchmark RNGs" benchmarks all ten (`benchmark.js`: rounds of alternating blocks through
`measure` in `../gpu-rng/sim.js`, on sims sharing one set of workload buffers), then runs the
picture afresh. Either way it runs 30 s on screen. The picker is labelled "RNG" (the user's).
Starting one page stops the others (a BroadcastChannel), so they don't share the GPU. The Ising
picture gets twice the GPU time per frame (`sliceMs`; the user: "more steps per frame").

`all.html` charts every generator on every workload from `results.json`: a column per workload,
steps per second up the side on a log scale (the user: "higher = faster", plain steps per
second), a line per generator in its own color (stateful dashed; eight palette colors, so orange
is used twice, once solid and once dashed, and purple too: Threefry-10 solid, xoshiro128** dashed), named at the right end (the user, Nov 3: "not on both sides"; under 480 px wide,
as in a phone's frame, not named at all, the buttons below being the legend); hover or click a generator to
pick it out (only generators every run in the picked source has: the Nov 3 runs have no
Threefry-10, and averaging it over fewer, faster runs would flatter it); a row of workload buttons (or a column's name) shows one workload as ranked bars,
stateful bars striped (the user: to "see relative ordering for trace or ising"); a table view.

`results.json` is a list of runs, each with every round's ms per step by workload and generator,
plus the environment (user agent, GPU adapter info, whether it had timestamps). "Results from"
picks one run, or the geometric mean of all of them (the default; the user, Nov 3: "maybe by
default the graph shows some kinda average of all the per-browser+machine numbers"). "Run all
benchmarks" benchmarks every workload in the browser it's in and adds the run, kept in
localStorage; "copy results" copies that browser's runs as `{"runs": [...]}` to add here, the
name box giving their label (the user wants runs from iPhones and an NVIDIA desktop).

Measured Nov 3 on the user's MacBook Pro (M1 Pro), test suites paused: two runs each in Chrome
156 (headless) and Firefox 159 (a window). The same browser's two runs agree within a few
percent (up to about 10% in the worst cells); Firefox is slower than Chrome, Philox most (pi:
3.5K vs 5.9K steps/s). An earlier 1.7x swing between runs came from measuring on a busy machine.
Safari 26 couldn't run while the screen was locked (it freezes the page); it needs a run with the
user there. An iPhone 15 (Safari 27.0.1, the user's, Nov 3) ran `all.html?autorun=1` twice,
served from the laptop: `tools/collect.py web DIR` on port 4345 behind `tailscale serve --bg 4345`, since
WebGPU needs HTTPS (a plain `http://100.x` address has no `navigator.gpu`). It saves the run to
DIR. The two runs agree within a few percent (xoshiro 1.53 vs 1.61, the most). Against
Threefry-12 its ranking matches the Mac's (run 1, geometric mean over workloads: pcg4d
0.84, xxhash32 1.11, Threefry-20 1.15, TEA-6 1.31, xoshiro 1.53, PCG32 1.70, Philox 1.71, XORWOW
2.43); it is about 3x slower in absolute terms (Threefry-12 pi 0.225 vs 0.075 ms per step).

## Statistical quality

`quality/`: each generator's stream is laid out as the benchmark uses it: frame after frame,
every thread's four words (2^20 threads), thread 0 first, seed 1. The C ports match the GPU bit
for bit (checked Nov 3: all nine, and Threefry-10 Nov 6; frames 0 and 1, threads 0-3 and the last, through the raw
kernel). Why C (the user asked): TestU01 and PractRand pull numbers on the CPU, BigCrush needs
about 2^38 and PractRand up to 1 TB, and the ports compute exactly what the shaders do.

Results so far are in `quality/results/` and `quality/README.md`. The runs started Nov 3, 17:25
by `run-all.sh` are detached (`nohup`, parented to launchd, not to any Claude session): they
survive the session and the terminal closing, pause during sleep, and die on logout or reboot.
Nothing collects them: a later session runs `quality/status.sh`, and once everything has
finished, summarizes the results in `quality/README.md` and commits `results/`. The
one-thread PractRand runs and the bench's Safari run were done by hand (see `quality/README.md`
and above). The BigCrush files fill in 4 KB chunks (buffered); the summary is at the end.
