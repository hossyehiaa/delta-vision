/* Delta Vision — geodesic polygon area (identical math to the Basira engine's
 * geo helper and the client's src/geo.js: Turf-style ring sum on the sphere). */
export type LonLat = [number, number];

const R_EARTH = 6371008.8; // mean Earth radius (m), same as Turf.js
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Approximate polygon area on the sphere (m²) — Turf-style ring sum. */
export function ringAreaM2(ring: LonLat[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [l1, p1] = ring[i];
    const [l2, p2] = ring[(i + 1) % n];
    total += (rad(l2) - rad(l1)) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return Math.abs((total * R_EARTH * R_EARTH) / 2);
}

export function polygonAreaKm2(rings: LonLat[][]): number {
  let area = 0;
  for (let i = 0; i < rings.length; i++) {
    area += i === 0 ? ringAreaM2(rings[i]) : -ringAreaM2(rings[i]); // holes subtract
  }
  return area / 1e6;
}
