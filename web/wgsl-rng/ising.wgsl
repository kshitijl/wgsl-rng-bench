// The 2D Ising model at its critical temperature, by Metropolis updates on a checkerboard: each
// frame updates every site of one color, so a sweep is two frames. Each thread updates four
// sites of a row with one rand4. Periodic boundaries; spins are 0 (down) or 1 (up).

struct Params {
  count: u32, // threads: L * L / 8
  frame: u32,
  seed: u32,
  beta: f32, // 1 / temperature, with J = k_B = 1
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> spins: array<u32>;

const L = 2048u;
const HALF = L / 2u; // sites of one color in a row
const CALLS = 1u;

fn thread_count() -> u32 {
  return params.count;
}

fn spin(x: u32, y: u32) -> i32 {
  return select(-1, 1, spins[y * L + x] == 1u);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.count) { return; }
  let color = params.frame % 2u;
  rng_begin(id.x, params.frame);
  let r = rand4(0u);
  rng_end();
  let first = id.x * 4u; // among this color's sites, row by row
  let y = first / HALF;
  for (var j = 0u; j < 4u; j++) {
    let x = 2u * ((first + j) % HALF) + (y + color) % 2u;
    let s = spin(x, y);
    let around = spin((x + 1u) % L, y) + spin((x + L - 1u) % L, y) + spin(x, (y + 1u) % L) + spin(x, (y + L - 1u) % L);
    let energy_change = 2 * s * around;
    if (energy_change <= 0 || r[j] < exp(-params.beta * f32(energy_change))) {
      spins[y * L + x] = select(1u, 0u, s == 1);
    }
  }
}

// Random starting spins, eight per thread, from their own key: the same for every generator.
@compute @workgroup_size(256)
fn place(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.count) { return; }
  for (var half = 0u; half < 2u; half++) {
    let bits = philox4x32_10(vec4u(id.x, half, 0u, 0u), vec2u(params.seed, 0x15196u));
    for (var j = 0u; j < 4u; j++) { spins[id.x * 8u + half * 4u + j] = bits[j] >> 31u; }
  }
}
