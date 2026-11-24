/* Delta Vision — geodesic polygon area.
 *
 * IDENTICAL math to the client's src/geo.js (authalic-latitude ring sum with
 * edge densification on the authalic sphere), which matches PostGIS
 * ST_Area(geography) to ~0.01 km² on the Borj El Arab study polygon. One
 * formula everywhere: the AOI chip, the hero figure, the class table footer
 * and the engine's normalisation target all agree exactly. */
export type LonLat = [number, number];

const A_WGS = 6378137.0;      // WGS84 semi-major axis (m)
const B_WGS = 6356752.3142;   // WGS84 semi-minor axis (m)
const E1 = Math.sqrt(1 - (B_WGS * B_WGS) / (A_WGS * A_WGS));   // 1st eccentricity
const E2 = 1 - (B_WGS * B_WGS) / (A_WGS * A_WGS);              // 1st eccentricity²
/** authalic sphere radius of the WGS84 ellipsoid (m) */
const R_AUTH = Math.sqrt(
  (2 * Math.PI * A_WGS * A_WGS + Math.PI * (B_WGS * B_WGS / E1) * Math.log((1 + E1) / (1 - E1))) / (4 * Math.PI)
);
const QP = 1 + ((1 - E2) / (2 * E1)) * Math.log((1 + E1) / (1 - E1));
const MAX_EDGE_M = 5000;
const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** sin of the authalic latitude (Snyder) */
function sinAuthalic(latRad: number): number {
  const s = Math.sin(latRad), e2s2 = E2 * s * s;
  return ((1 - E2) * (s / (1 - e2s2) - Math.log((1 - E1 * s) / (1 + E1 * s)) / (2 * E1))) / QP;
}

/** split long edges so the spherical ring sum stays accurate on coarse polygons */
function densify(ring: LonLat[]): LonLat[] {
  const n = ring.length;
  if (!n) return [];
  const closed = n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1];
  const edges = closed ? n - 1 : n;
  const out: LonLat[] = [[ring[0][0], ring[0][1]]];
  const cos0 = Math.max(Math.abs(Math.cos(rad(ring[0][1]))), 1e-6);
  for (let i = 0; i < edges; i++) {
    const prev = ring[i], p = ring[(i + 1) % n];
    const dx = (p[0] - prev[0]) * cos0 * 111320, dy = (p[1] - prev[1]) * 110574;
    const nseg = clamp(Math.ceil(Math.sqrt(dx * dx + dy * dy) / MAX_EDGE_M), 1, 4000);
    for (let k = 1; k <= nseg; k++) {
      const t = k / nseg;
      out.push([prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t]);
    }
  }
  return out;
}

/** Approximate polygon area on the authalic sphere (m²) — matches the client. */
export function ringAreaM2(ring: LonLat[]): number {
  if (!ring || ring.length < 3) return 0;
  const pts = densify(ring);
  let sum = 0, lamPrev = 0, sbPrev = 0;
  for (let i = 0; i < pts.length; i++) {
    const lam = rad(pts[i][0]);
    const sb = clamp(sinAuthalic(rad(pts[i][1])), -1, 1);
    if (i > 0) {
      let d = lam - lamPrev;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      sum += d * (2 + sbPrev + sb);
    }
    lamPrev = lam; sbPrev = sb;
  }
  return Math.abs((sum / 2) * R_AUTH * R_AUTH);
}

export function polygonAreaKm2(rings: LonLat[][]): number {
  let area = 0;
  for (let i = 0; i < rings.length; i++) {
    area += i === 0 ? ringAreaM2(rings[i]) : -ringAreaM2(rings[i]); // holes subtract
  }
  return area / 1e6;
}
