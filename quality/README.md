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

(Filled in as the runs finish.)
