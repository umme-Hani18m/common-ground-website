import exifr from "exifr";

export const GEOTAG_MATCH_RADIUS_METERS = 1_000;
export type GeotagVerificationStatus = "verified" | "unverified_missing_gps" | "unverified_no_claimed_location" | "unverified_out_of_range" | "unverified_invalid";

export type GeotagResult = {
  latitude: number | null;
  longitude: number | null;
  capturedAt: Date | null;
  distanceMeters: number | null;
  status: GeotagVerificationStatus;
};

function validCoordinate(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function haversineMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radius = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latitudeB - latitudeA);
  const dLon = radians(longitudeB - longitudeA);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function firstDate(...values: unknown[]) {
  for (const value of values) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

export async function extractAndVerifyGeotag(bytes: Buffer, claimedLatitude: string | null, claimedLongitude: string | null): Promise<GeotagResult> {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = (await exifr.parse(bytes, { gps: true, exif: true, tiff: true })) ?? {};
  } catch {
    return { latitude: null, longitude: null, capturedAt: null, distanceMeters: null, status: "unverified_invalid" };
  }
  const latitude = typeof metadata.latitude === "number" ? metadata.latitude : null;
  const longitude = typeof metadata.longitude === "number" ? metadata.longitude : null;
  const capturedAt = firstDate(metadata.DateTimeOriginal, metadata.CreateDate, metadata.ModifyDate);
  if (!validCoordinate(latitude, longitude)) return { latitude: null, longitude: null, capturedAt, distanceMeters: null, status: "unverified_missing_gps" };
  const claimedLat = claimedLatitude === null ? null : Number(claimedLatitude);
  const claimedLon = claimedLongitude === null ? null : Number(claimedLongitude);
  if (!validCoordinate(claimedLat, claimedLon)) return { latitude, longitude, capturedAt, distanceMeters: null, status: "unverified_no_claimed_location" };
  const distanceMeters = haversineMeters(latitude as number, longitude as number, claimedLat as number, claimedLon as number);
  return { latitude, longitude, capturedAt, distanceMeters, status: distanceMeters <= GEOTAG_MATCH_RADIUS_METERS ? "verified" : "unverified_out_of_range" };
}
