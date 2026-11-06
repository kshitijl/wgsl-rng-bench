#!/bin/sh
# Runs BigCrush and PractRand (to 1 TB) on every generator, all at once, at low priority.
# Output in results/. Build the testers first with ./build-testers.sh (RNG_TEST overrides the
# PractRand it uses).
cd "$(dirname "$0")"
mkdir -p results
RNG_TEST=${RNG_TEST:-$PWD/testers/RNG_test}
[ -x "$RNG_TEST" ] && [ -x crush ] || { echo "run ./build-testers.sh first" >&2; exit 1; }
for g in philox threefry20 threefry12 threefry10 pcg4d xxhash32 tea xorwow xoshiro pcg32; do
  nice -n 19 ./crush $g big > results/bigcrush-$g.txt 2>&1 &
  (./stream $g | nice -n 19 "$RNG_TEST" stdin32 -tlmax 1TB > results/practrand-$g.txt 2>&1) &
done
wait
