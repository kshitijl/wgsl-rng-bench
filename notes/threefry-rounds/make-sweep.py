"""Turns a copy of web/ into a benchmark of Threefry4x32 with 1 to 12 rounds, next to pcg4d.

    cp -R web /some/scratch/web
    python3 notes/threefry-rounds/make-sweep.py /some/scratch/web
    python3 tools/collect.py /some/scratch/web /some/scratch/runs   # then open
    http://127.0.0.1:4345/wgsl-rng/all.html?autorun=1 in a browser with WebGPU

Appends tf_1 .. tf_12 to the copy's threefry.wgsl, written out round by round like
threefry4x32_12 (tf_12 and tf_10 come out identical to the tested threefry4x32_12 and the
removed threefry4x32_10), writes gen-tf<N>.wgsl for each, and replaces the copy's generator list
with pcg4d and those twelve. Never run it on the repo's own web/.
"""

import sys
from pathlib import Path

# Random123's R_32x4 rotation constants, as in threefry.wgsl's TF_ROT0 and TF_ROT1.
ROT0 = [10, 11, 13, 23, 6, 17, 25, 18]
ROT1 = [26, 21, 27, 5, 20, 11, 10, 20]
MAX_ROUNDS = 12


def written_out(n: int) -> str:
    """WGSL for n rounds: the loop in threefry.wgsl unrolled, key injected after every 4th round."""
    lines = [
        f"fn tf_{n}(ctr: vec4u, key: vec4u) -> vec4u {{",
        "  let ks = array<u32, 5>(key.x, key.y, key.z, key.w, SKEIN_KS_PARITY32 ^ key.x ^ key.y ^ key.z ^ key.w);",
        "  var x = ctr + key;",
    ]
    for r in range(n):
        a, b = ROT0[r % 8], ROT1[r % 8]
        if r % 2 == 0:
            lines.append(
                f"  x.x += x.y; x.y = rotl32(x.y, {a}u) ^ x.x; x.z += x.w; x.w = rotl32(x.w, {b}u) ^ x.z;"
            )
        else:
            lines.append(
                f"  x.x += x.w; x.w = rotl32(x.w, {a}u) ^ x.x; x.z += x.y; x.y = rotl32(x.y, {b}u) ^ x.z;"
            )
        if r % 4 == 3:
            s = (r + 1) // 4
            ks = ", ".join(f"ks[{(s + i) % 5}]" for i in range(4))
            lines.append(f"  x += vec4u({ks}); x.w += {s}u;")
    lines += ["  return x;", "}", ""]
    return "\n".join(lines)


def main() -> None:
    web = Path(sys.argv[1])
    rng = web / "wgsl-rng"
    with open(rng / "threefry.wgsl", "a") as f:
        f.write("\n" + "\n".join(written_out(n) for n in range(1, MAX_ROUNDS + 1)))
    entries = [
        '  { id: "pcg4d", name: "pcg4d", family: "counter", files: ["hashes", "gen-pcg4d"], stateBytes: 0 },'
    ]
    for n in range(1, MAX_ROUNDS + 1):
        (rng / f"gen-tf{n}.wgsl").write_text(
            "fn rand4u(call: u32) -> vec4u {\n"
            f"  return tf_{n}(vec4u(draw_index(call), 0u, rng_thread, 0u), vec4u(params.seed, 0u, 0u, 0u));\n"
            "}\n"
        )
        entries.append(
            f'  {{ id: "tf{n}", name: "Threefry-{n}", family: "counter", files: ["threefry", "gen-tf{n}"], stateBytes: 0 }},'
        )
    gens = (rng / "generators.js").read_text()
    head = "export const GENERATORS = [\n"
    start = gens.index(head) + len(head)
    end = gens.index("];", start)
    (rng / "generators.js").write_text(
        gens[:start] + "\n".join(entries) + "\n" + gens[end:]
    )


if __name__ == "__main__":
    main()
