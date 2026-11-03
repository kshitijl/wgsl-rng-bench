// rng_begin and rng_end for the counter-based generators: nothing to load or store, they only
// remember which thread and frame this is. rand4u(call) then hashes (thread, frame * CALLS + call).

var<private> rng_thread: u32;
var<private> rng_frame: u32;

fn rng_begin(thread: u32, frame: u32) {
  rng_thread = thread;
  rng_frame = frame;
}

fn rng_end() {}

// Which draw this is, counting every draw this thread makes.
fn draw_index(call: u32) -> u32 {
  return rng_frame * CALLS + call;
}
