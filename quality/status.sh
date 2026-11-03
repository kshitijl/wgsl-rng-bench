#!/bin/sh
# Where the runs started by run-all.sh are: which are still running, how far each got, and any
# failures so far. Output files are in results/.
cd "$(dirname "$0")/results"
echo "still running: $(pgrep -f 'crush .* big' | wc -l | tr -d ' ') BigCrush, $(pgrep -f 'RNG_test stdin32' | wc -l | tr -d ' ') PractRand"
for f in bigcrush-*.txt; do
  if grep -q "Summary results of BigCrush" "$f"; then
    printf "%-26s done: %s\n" "$f" "$(grep -E 'All tests were passed|tests gave p-values' "$f" | head -1 | sed 's/^ *//')"
  else
    printf "%-26s running, %s tests finished\n" "$f" "$(grep -c 'p-value of test' "$f")"
  fi
done
for f in practrand-*.txt; do
  printf "%-32s %-36s %s\n" "$f" "$(grep 'length=' "$f" | tail -1 | cut -d, -f1)" "$(grep -c FAIL "$f") FAIL lines"
done
