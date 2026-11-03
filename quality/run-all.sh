#!/bin/sh
# Runs BigCrush and PractRand (to 1 TB) on every generator, all at once, at low priority.
# Output in results/. RNG_test is PractRand's, built as README.md says; set RNG_TEST to its path.
cd "$(dirname "$0")"
mkdir -p results
RNG_TEST=${RNG_TEST:?set RNG_TEST to the path of PractRand RNG_test}
for g in philox threefry20 threefry12 pcg4d xxhash32 tea xorwow xoshiro pcg32; do
  nice -n 19 ./crush $g big > results/bigcrush-$g.txt 2>&1 &
  (./stream $g | nice -n 19 "$RNG_TEST" stdin32 -tlmax 1TB > results/practrand-$g.txt 2>&1) &
done
wait
