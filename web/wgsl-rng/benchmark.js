// Benchmarking every generator on one workload, shared by the bench pages and the "run all
// benchmarks" button (all.js): rounds of alternating blocks, one generator at a time, through
// measure in ../gpu-rng/sim.js, on sims that share one set of workload buffers.

import { GENERATORS } from "./generators.js";
import { makeSim } from "./sim.js";
import { measure } from "../gpu-rng/sim.js";

export const ROUNDS = 8;

// Each generator's ms per step, round by round: { [gen id]: [ms, ...] }. onRound gets the same
// shape after every round.
export async function benchmarkWorkload({ device, workload, rounds = ROUNDS, keepGoing = () => true, onRound = () => {} }) {
  const buffers = workload.buffers(device);
  const sims = [];
  for (const gen of GENERATORS) sims.push(await makeSim({ device, workload, gen, buffers }));
  const byGen = (results) => Object.fromEntries(GENERATORS.map((g, i) => [g.id, [...results[i]]]));
  const results = await measure({ device, sims, rounds, keepGoing, onRound: (r) => onRound(byGen(r)) });
  sims.forEach((s) => s.destroy());
  Object.values(buffers).forEach((b) => b.destroy());
  return byGen(results);
}

// What the results were measured on, as far as the page can tell.
export function environment(device) {
  const info = device.adapterInfo ?? {};
  return {
    userAgent: navigator.userAgent,
    gpu: { vendor: info.vendor ?? "", architecture: info.architecture ?? "", device: info.device ?? "", description: info.description ?? "" },
    timestamps: device.features.has("timestamp-query"),
  };
}
