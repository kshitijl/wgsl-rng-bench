// The generators, in the picker's order. `files` are the shader files that define rand4u (see
// common.wgsl), after ../gpu-rng/philox.wgsl and common.wgsl; counter-based ones also get
// stateless.wgsl. `stateBytes`: generator state per thread, loaded and stored every frame.
export const GENERATORS = [
  { id: "philox", name: "Philox4x32-10", family: "counter", files: ["gen-philox"], stateBytes: 0 },
  { id: "threefry20", name: "Threefry4x32-20", family: "counter", files: ["threefry", "gen-threefry20"], stateBytes: 0 },
  { id: "threefry12", name: "Threefry4x32-12", family: "counter", files: ["threefry", "gen-threefry12"], stateBytes: 0 },
  { id: "pcg4d", name: "pcg4d", family: "counter", files: ["hashes", "gen-pcg4d"], stateBytes: 0 },
  { id: "xxhash32", name: "xxhash32", family: "counter", files: ["hashes", "gen-xxhash32"], stateBytes: 0 },
  { id: "tea", name: "TEA, 6 cycles", family: "counter", files: ["hashes", "gen-tea"], stateBytes: 0 },
  { id: "xorwow", name: "XORWOW", family: "stateful", files: ["../gpu-rng/xorwow-core", "gen-xorwow"], stateBytes: 24 },
  { id: "xoshiro", name: "xoshiro128**", family: "stateful", files: ["xoshiro-core", "gen-xoshiro"], stateBytes: 16 },
  { id: "pcg32", name: "PCG32", family: "stateful", files: ["pcg32-core", "gen-pcg32"], stateBytes: 16 },
];

export const FAMILIES = {
  counter: { name: "counter-based", color: "c0" },
  stateful: { name: "stateful", color: "c1" },
};
