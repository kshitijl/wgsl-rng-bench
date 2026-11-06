#!/bin/sh
# Builds the statistical testers into testers/ (git-ignored), then crush and stream here:
#   testers/testu01/          TestU01 1.2.3 (lib/, include/), from its authors' GitHub at a fixed commit
#   testers/RNG_test          PractRand pre0.95's RNG_test, from SourceForge, checked by SHA-256
# Each is built once; delete its folder or file to rebuild it. crush and stream are rebuilt every
# time, to a temporary name and then renamed, so a run already using the old binary goes on
# undisturbed. Logs of the builds are in testers/*.log. Then: ./run-all.sh, or by hand as README.md says.
#
# Why here and not in a scratch folder: the builds of Nov 3 and Nov 6 were both in temporary
# folders and were gone when needed again.
set -eu
cd "$(dirname "$0")"
T=$PWD/testers
mkdir -p "$T"

# TestU01's site refused the download on Nov 6; its authors' GitHub repo has the same 1.2.3 code.
# The commit hash pins the contents.
TU_REPO=https://github.com/umontreal-simul/TestU01-2009
TU_COMMIT=57e98bf33880daedc930739c81e39b89a8d24dba
PR_URL=https://downloads.sourceforge.net/project/pracrand/PractRand-pre0.95.zip
PR_SHA256=5738c322ccb983b63fbe693f305afa2a7c73e64a80b303c9139278c453ce27b4

sha256() { if command -v shasum >/dev/null; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1; }

if [ ! -f "$T/testu01/lib/libtestu01.a" ]; then
  echo "building TestU01 (a few minutes; log in testers/testu01.log)"
  rm -rf "$T/testu01-src" "$T/testu01"
  git init -q "$T/testu01-src"
  git -C "$T/testu01-src" fetch -q --depth 1 "$TU_REPO" "$TU_COMMIT"
  git -C "$T/testu01-src" -c advice.detachedHead=false checkout -q FETCH_HEAD
  # Its config.sub predates Apple Silicon; telling configure it's x86_64 only gets past that check,
  # and the compiler still builds for the machine it's on.
  case "$(uname -s)" in
    Darwin) HOST="--build=x86_64-apple-darwin --host=x86_64-apple-darwin" ;;
    *) HOST="" ;;
  esac
  (
    cd "$T/testu01-src"
    # shellcheck disable=SC2086
    ./configure --prefix="$T/testu01" $HOST CFLAGS="-O2 -w -std=gnu89"
    make -j8
    make install
  ) > "$T/testu01.log" 2>&1 || { echo "TestU01 build failed; see testers/testu01.log" >&2; exit 1; }
fi

if [ ! -x "$T/RNG_test" ]; then
  echo "building PractRand (a minute or two; log in testers/practrand.log)"
  rm -rf "$T/practrand-src"
  mkdir -p "$T/practrand-src"
  curl -fsSL -o "$T/practrand-src/PractRand.zip" "$PR_URL"
  got=$(sha256 "$T/practrand-src/PractRand.zip")
  if [ "$got" != "$PR_SHA256" ]; then
    echo "PractRand download's SHA-256 is $got, expected $PR_SHA256" >&2
    exit 1
  fi
  (
    cd "$T/practrand-src"
    unzip -q PractRand.zip
    c++ -O3 -std=c++14 -w -Iinclude src/*.cpp src/RNGs/*.cpp src/RNGs/other/*.cpp tools/RNG_test.cpp -o RNG_test.new -pthread
    mv RNG_test.new "$T/RNG_test"
  ) > "$T/practrand.log" 2>&1 || { echo "PractRand build failed; see testers/practrand.log" >&2; exit 1; }
fi

TU=$T/testu01
cc -O3 -march=native -o stream.new stream.c && mv stream.new stream
cc -O3 -march=native -w -I"$TU/include" crush.c -o crush.new "$TU/lib/libtestu01.a" "$TU/lib/libprobdist.a" "$TU/lib/libmylib.a" -lm && mv crush.new crush
echo "ok: testers/RNG_test, testers/testu01, crush, stream"
