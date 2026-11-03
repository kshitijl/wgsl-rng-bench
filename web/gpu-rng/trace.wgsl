// A small path tracer for a Cornell box: diffuse walls and spheres, one spherical light, next-event
// estimation (a shadow ray to the light at every bounce) and cosine-weighted bounces. Ported from
// github.com/kshitijl/cuda-light-transport.
//
// It needs random numbers from a function each variant defines:
//
//   fn rand4(call: u32) -> vec4f
//
// `call` numbers the draws within one sample: 0 for the camera ray, then one per bounce. The
// stateless variant needs it; the stateful one ignores it, because its state remembers where it is.
// Every sample makes exactly CALLS draws (the box is closed, so a path never escapes early), which
// is what lets the two variants line up draw for draw.

struct Params {
  width: u32,
  height: u32,
  frame: u32, // samples per pixel so far: the sample being drawn
  seed: u32,
  time: f32, // seconds, for the spheres' motion
}

@group(0) @binding(0) var<uniform> params: Params;

const BOUNCES = 5u;
const CALLS = BOUNCES + 1u;
const PI = 3.14159265;

// The box: x across, y up, z toward the camera. The wall behind the camera closes it.
const BOX_MAX = vec3f(100.0, 100.0, 200.0);
const LIGHT_CENTER = vec3f(50.0, 82.0, 60.0);
const LIGHT_RADIUS = 6.0;
const LIGHT_EMISSION = vec3f(24.0, 22.0, 19.0);
const EYE = vec3f(50.0, 50.0, 196.0);
const TAN_HALF_FOV = 0.50;
const EPS = 0.01;

struct Ray {
  origin: vec3f,
  dir: vec3f,
}

struct Hit {
  t: f32,
  normal: vec3f,
  albedo: vec3f,
  is_light: bool,
}

// The inside of the box. Exactly one face is ahead of the ray on each axis.
fn hit_box(ray: Ray) -> Hit {
  var best = Hit(1e30, vec3f(0.0), vec3f(0.0), false);
  for (var axis = 0; axis < 3; axis++) {
    let d = ray.dir[axis];
    if (abs(d) < 1e-8) { continue; }
    let far_side = d > 0.0;
    let wall = select(0.0, BOX_MAX[axis], far_side);
    let t = (wall - ray.origin[axis]) / d;
    if (t < best.t) {
      var n = vec3f(0.0);
      n[axis] = select(1.0, -1.0, far_side);
      var albedo = vec3f(0.75);
      if (axis == 0 && !far_side) { albedo = vec3f(0.75, 0.25, 0.25); }  // left: red
      if (axis == 0 && far_side) { albedo = vec3f(0.25, 0.25, 0.75); }   // right: blue
      best = Hit(t, n, albedo, false);
    }
  }
  return best;
}

// Distance along the ray to a sphere, or a negative number for a miss.
fn sphere_t(ray: Ray, center: vec3f, radius: f32) -> f32 {
  let oc = center - ray.origin;
  let b = dot(oc, ray.dir);
  let det = b * b - dot(oc, oc) + radius * radius;
  if (det < 0.0) { return -1.0; }
  let s = sqrt(det);
  if (b - s > EPS) { return b - s; }
  if (b + s > EPS) { return b + s; }
  return -1.0;
}

fn hit_sphere(ray: Ray, best: Hit, center: vec3f, radius: f32, albedo: vec3f, is_light: bool) -> Hit {
  let t = sphere_t(ray, center, radius);
  if (t > 0.0 && t < best.t) {
    let n = (ray.origin + t * ray.dir - center) / radius;
    return Hit(t, n, albedo, is_light);
  }
  return best;
}

// One sphere bounces at the back; the other circles in front of it.
fn bouncing_center() -> vec3f {
  return vec3f(50.0, 16.0 + 34.0 * abs(sin(params.time * 2.2)), 30.0);
}

fn circling_center() -> vec3f {
  let a = params.time * 0.9;
  return vec3f(50.0 + 26.0 * cos(a), 16.0, 85.0 + 20.0 * sin(a));
}

fn hit_scene(ray: Ray) -> Hit {
  var best = hit_box(ray);
  best = hit_sphere(ray, best, bouncing_center(), 16.0, vec3f(0.75), false);
  best = hit_sphere(ray, best, circling_center(), 16.0, vec3f(0.75), false);
  best = hit_sphere(ray, best, LIGHT_CENTER, LIGHT_RADIUS, vec3f(0.0), true);
  return best;
}

// Two unit vectors perpendicular to n and to each other.
fn basis(n: vec3f) -> mat3x3f {
  let helper = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(n.x) > 0.5);
  let u = normalize(cross(helper, n));
  let v = cross(n, u);
  return mat3x3f(u, v, n);
}

fn cosine_direction(n: vec3f, r: vec2f) -> vec3f {
  let phi = 2.0 * PI * r.x;
  let s = sqrt(r.y);
  return normalize(basis(n) * vec3f(cos(phi) * s, sin(phi) * s, sqrt(1.0 - r.y)));
}

// Light arriving at p straight from the light, times the diffuse BRDF and the cosine, divided by
// the probability of the direction chosen (uniform in the cone the light subtends).
fn direct_light(p: vec3f, n: vec3f, r: vec2f) -> vec3f {
  let to_light = LIGHT_CENTER - p;
  let dist2 = dot(to_light, to_light);
  let cos_max = sqrt(max(0.0, 1.0 - LIGHT_RADIUS * LIGHT_RADIUS / dist2));
  let cos_t = 1.0 - r.x * (1.0 - cos_max);
  let sin_t = sqrt(max(0.0, 1.0 - cos_t * cos_t));
  let phi = 2.0 * PI * r.y;
  let dir = basis(normalize(to_light)) * vec3f(cos(phi) * sin_t, sin(phi) * sin_t, cos_t);
  let cos_surface = dot(n, dir);
  if (cos_surface <= 0.0) { return vec3f(0.0); }
  let shadow = hit_scene(Ray(p, dir));
  if (!shadow.is_light) { return vec3f(0.0); }
  return LIGHT_EMISSION * cos_surface * 2.0 * (1.0 - cos_max);
}

fn trace(pixel: vec2u) -> vec3f {
  let r0 = rand4(0u);
  let aspect = f32(params.width) / f32(params.height);
  let sx = ((f32(pixel.x) + r0.x) / f32(params.width) * 2.0 - 1.0) * TAN_HALF_FOV * aspect;
  let sy = (1.0 - (f32(pixel.y) + r0.y) / f32(params.height) * 2.0) * TAN_HALF_FOV;
  var ray = Ray(EYE, normalize(vec3f(sx, sy, -1.0)));

  var radiance = vec3f(0.0);
  var throughput = vec3f(1.0);
  for (var bounce = 0u; bounce < BOUNCES; bounce++) {
    let hit = hit_scene(ray);
    let r = rand4(bounce + 1u);
    if (hit.is_light) {
      // Only the camera ray counts light it hits directly; later bounces count it through
      // direct_light. Either way the path ends here, but keeps drawing so every sample makes
      // CALLS draws.
      if (bounce == 0u) { radiance += LIGHT_EMISSION; }
      throughput = vec3f(0.0);
      continue;
    }
    let p = ray.origin + hit.t * ray.dir + hit.normal * EPS;
    throughput *= hit.albedo;
    radiance += throughput * direct_light(p, hit.normal, r.xy);
    ray = Ray(p, cosine_direction(hit.normal, r.zw));
  }
  return radiance;
}

@group(0) @binding(1) var<storage, read_write> accum: array<vec4f>;

fn add_sample(index: u32, color: vec3f) {
  accum[index] += vec4f(color, 1.0);
}
