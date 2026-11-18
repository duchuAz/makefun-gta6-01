// Small numeric helpers shared by every system. Angles are radians; headings treat +Z as
// forward and rotate around +Y, matching the car meshes.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent approach: 1 - e^(-k dt). */
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

export const wrapAngle = (a) => {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
};

export const angleLerp = (a, b, t) => a + wrapAngle(b - a) * t;

export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/** A deterministic 32-bit hash -> [0, 1), used by the skyline and window lights. */
export function hash01(n) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Seeded little RNG (mulberry32); each system gets its own so shots are deterministic. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (list, random = Math.random) => list[Math.floor(random() * list.length) % list.length];

export const money = (n) => `$${Math.max(0, Math.round(n)).toLocaleString('en-US')}`;

export const pad = (n, width = 2) => String(n).padStart(width, '0');

export const headingTo = (dx, dz) => Math.atan2(dx, dz);

/** Ray vs axis-aligned XZ box, ignoring Y. Returns distance along ray or Infinity. */
export function rayBoxXZ(ox, oz, dx, dz, minX, maxX, minZ, maxZ) {
  let tmin = 0;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-6) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    const t1 = (minX - ox) / dx;
    const t2 = (maxX - ox) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  if (Math.abs(dz) < 1e-6) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    const t1 = (minZ - oz) / dz;
    const t2 = (maxZ - oz) / dz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  return tmin <= tmax && tmax >= 0 ? tmin : Infinity;
}

