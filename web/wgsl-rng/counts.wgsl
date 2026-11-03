// thread_count() for kernels whose Params starts with `count` (../gpu-rng/pi.wgsl, ink.wgsl).
fn thread_count() -> u32 {
  return params.count;
}
