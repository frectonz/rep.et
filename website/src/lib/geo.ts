import type { Representative } from "./data";

const R = 6371; // Earth radius in km

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearest(
  userLat: number,
  userLng: number,
  reps: Pick<Representative, "lat" | "lng" | "slug">[],
): { slug: string; distance: number } {
  let minDist = Infinity;
  let nearestSlug = "";

  for (const r of reps) {
    const d = haversine(userLat, userLng, r.lat, r.lng);
    if (d < minDist) {
      minDist = d;
      nearestSlug = r.slug;
    }
  }

  return { slug: nearestSlug, distance: minDist };
}
