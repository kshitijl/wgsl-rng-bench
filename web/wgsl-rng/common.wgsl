// Shared by every generator: rand4 as floats, from a generator's rand4u. Each generator file
// defines rng_begin(thread, frame), rand4u(call) -> vec4u (four random 32-bit words) and rng_end();
// a stateful one also its `states` buffer at binding 9 and an `init` entry point. The kernel
// defines Params (with `frame` and `seed`), CALLS (rand4 calls per thread per frame) and
// thread_count(). to_unit_floats is in ../gpu-rng/philox.wgsl, which is always included.

fn rand4(call: u32) -> vec4f {
  return to_unit_floats(rand4u(call));
}

fn rotl32(x: u32, k: u32) -> u32 {
  return (x << k) | (x >> (32u - k));
}
