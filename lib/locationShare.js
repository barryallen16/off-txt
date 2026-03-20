// Reading a fix and mailing it out as one SMS.

import * as Location from "expo-location";
import { encodeLocation } from "./geo";
import { KIND, encodeTransfer } from "./transfer";
import { sendParts } from "./sms";

/**
 * @returns {Promise<{ granted: boolean, reason: string | null }>}
 */
export async function requestLocationAccess() {
  const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
  if (!enabled) {
    return { granted: false, reason: "Turn on location services first." };
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    return { granted: false, reason: "Location permission was denied." };
  }

  return { granted: true, reason: null };
}

/** @returns {Promise<{ lat: number, lon: number, accuracy: number, timestamp: number }>} */
export async function readFix() {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy ?? 0,
    timestamp: position.timestamp || Date.now(),
  };
}

/**
 * One update: encode the fix, split into parts, send.
 * @param {{ address: string, session: string, fix: object }} input
 */
export async function shareLocation({ address, session, fix }) {
  const { payload } = encodeLocation({
    lat: fix.lat,
    lon: fix.lon,
    accuracy: fix.accuracy,
    timestamp: fix.timestamp,
    session,
  });

  const { parts, total } = encodeTransfer(KIND.LOCATION, payload);
  const result = await sendParts(address, parts);

  return { ...result, payload, parts: total };
}
