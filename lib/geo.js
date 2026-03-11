// Live location packets.
//
// A packet is one SMS:
//
//   <session>,<lat>,<lon>,<accuracy m>,<unix seconds>
//
// Commas only, because GSM-7 has no pipe or brackets and any of those would
// drop the message to 70 character UCS-2 segments. Five decimal places is
// about one metre, which is finer than GPS itself.

const SESSION_CHARS = 3;
const DECIMALS = 5;

function base36(number, width) {
  return Math.max(0, Math.trunc(number))
    .toString(36)
    .padStart(width, "0")
    .slice(-width);
}

export function newSessionId() {
  return base36(Math.floor(Math.random() * 36 ** SESSION_CHARS), SESSION_CHARS);
}

/**
 * @param {{ lat: number, lon: number, accuracy?: number, timestamp?: number, session?: string }} point
 * @returns {{ session: string, payload: string }}
 */
export function encodeLocation({
  lat,
  lon,
  accuracy = 0,
  timestamp = Date.now(),
  session,
}) {
  const id = session ?? newSessionId();
  const payload = [
    id,
    Number(lat).toFixed(DECIMALS),
    Number(lon).toFixed(DECIMALS),
    Math.max(0, Math.round(Number(accuracy) || 0)),
    Math.round(Number(timestamp) / 1000),
  ].join(",");

  return { session: id, payload };
}

/**
 * @param {string} payload
 * @returns {{ session: string, lat: number, lon: number, accuracy: number, timestamp: number } | null}
 */
export function decodeLocation(payload) {
  if (typeof payload !== "string") return null;

  const fields = payload.trim().split(",");
  if (fields.length !== 5) return null;

  const lat = Number(fields[1]);
  const lon = Number(fields[2]);
  const accuracy = Number(fields[3]);
  const seconds = Number(fields[4]);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return {
    session: fields[0],
    lat,
    lon,
    accuracy: Number.isFinite(accuracy) ? accuracy : 0,
    timestamp: seconds * 1000,
  };
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in metres, rounded. */
export function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * Order points, drop duplicates and work out how fresh the trail is.
 * @param {Array<{ lat: number, lon: number, timestamp: number }>} points
 * @param {{ now?: number, staleAfterMs?: number }} [options]
 */
export function buildTrail(points, options = {}) {
  const now = options.now ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? 5 * 60 * 1000;

  const ordered = [...points]
    .filter((point) => Number.isFinite(point?.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter(
      (point, index, list) =>
        index === 0 ||
        point.timestamp !== list[index - 1].timestamp ||
        point.lat !== list[index - 1].lat ||
        point.lon !== list[index - 1].lon,
    );

  let travelled = 0;
  for (let i = 1; i < ordered.length; i++) {
    travelled += distanceMeters(ordered[i - 1], ordered[i]);
  }

  const latest = ordered[ordered.length - 1] ?? null;
  const ageMs = latest ? Math.max(0, now - latest.timestamp) : null;

  return {
    points: ordered,
    latest,
    travelled,
    ageMs,
    stale: ageMs == null ? true : ageMs > staleAfterMs,
  };
}

/** "42 s ago", "6 min ago", "2 h ago". */
export function formatAge(ageMs) {
  if (ageMs == null) return "no fix yet";
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** "850 m", "3.4 km". */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "0 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
