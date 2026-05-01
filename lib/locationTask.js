// Live location runs as an Expo background task, backed by an Android
// foreground service. The old implementation used setInterval inside the
// screen, which Android suspends as soon as the screen turns off.

import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getMeta, setMeta } from "./db";
import { shareLocation } from "./locationShare";

export const LOCATION_TASK = "offtxt-live-location";

export const LOCATION_KEYS = {
  address: "location_share_address",
  session: "location_share_session",
  interval: "location_share_interval",
  active: "location_share_active",
  sent: "location_share_sent",
  lastAt: "location_share_last_at",
  lastFix: "location_share_last_fix",
  error: "location_share_error",
};

function readConfig() {
  if (getMeta(LOCATION_KEYS.active) !== "1") return null;

  const address = getMeta(LOCATION_KEYS.address);
  const session = getMeta(LOCATION_KEYS.session);
  if (!address || !session) return null;

  const intervalSec = Number(getMeta(LOCATION_KEYS.interval)) || 60;
  return { address, session, intervalSec };
}

function writeError(message) {
  setMeta(LOCATION_KEYS.error, message ?? "");
}

/**
 * Runs while the app is backgrounded or killed. Expo delivers one or more
 * fixes per wake-up; each one leaves as its own SMS.
 */
async function locationTask({ data, error }) {
  if (error) {
    writeError(error.message ?? "Location tracking stopped.");
    return;
  }

  const config = readConfig();
  if (!config) return;

  const locations = Array.isArray(data?.locations) ? data.locations : [];

  for (const location of locations) {
    const fix = {
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      accuracy: location.coords.accuracy ?? 0,
      timestamp: location.timestamp || Date.now(),
    };

    const result = await shareLocation({
      address: config.address,
      session: config.session,
      fix,
    });

    if (result.sent) {
      const sent = Number(getMeta(LOCATION_KEYS.sent)) || 0;
      setMeta(LOCATION_KEYS.sent, String(sent + 1));
      setMeta(LOCATION_KEYS.lastAt, String(Date.now()));
      setMeta(LOCATION_KEYS.lastFix, JSON.stringify(fix));
      writeError(null);
    } else {
      writeError(result.reason ?? "The message did not leave the phone.");
    }
  }
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask(LOCATION_TASK, locationTask);
}

/** Everything the screen needs to redraw after a background update. */
export function getLocationShareState() {
  let lastFix = null;
  try {
    lastFix = JSON.parse(getMeta(LOCATION_KEYS.lastFix) ?? "null");
  } catch {
    lastFix = null;
  }

  const address = getMeta(LOCATION_KEYS.address);
  return {
    active: getMeta(LOCATION_KEYS.active) === "1",
    address: address || null,
    session: getMeta(LOCATION_KEYS.session) || null,
    intervalSec: Number(getMeta(LOCATION_KEYS.interval)) || 60,
    sentCount: Number(getMeta(LOCATION_KEYS.sent)) || 0,
    lastAt: Number(getMeta(LOCATION_KEYS.lastAt)) || null,
    lastFix,
    error: getMeta(LOCATION_KEYS.error) || null,
  };
}

/**
 * Start or retune the foreground service.
 * @param {{ address: string, session: string, intervalSec: number, reset?: boolean }} input
 */
export async function startLocationShare({
  address,
  session,
  intervalSec,
  reset = false,
}) {
  setMeta(LOCATION_KEYS.address, address);
  setMeta(LOCATION_KEYS.session, session);
  setMeta(LOCATION_KEYS.interval, String(intervalSec));
  setMeta(LOCATION_KEYS.active, "1");
  writeError(null);

  if (reset) setMeta(LOCATION_KEYS.sent, "0");

  try {
    const already = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK,
    ).catch(() => false);
    if (already) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: Math.max(5, intervalSec) * 1000,
      distanceInterval: 0,
      deferredUpdatesInterval: Math.max(5, intervalSec) * 1000,
      deferredUpdatesTimeout: Math.max(5, intervalSec) * 1000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "off-txt live location",
        notificationBody: `Sending a fix every ${intervalSec} s. Tap Stop sharing in the app to stop.`,
        notificationColor: "#7c5cff",
        killServiceOnDestroy: false,
      },
    });
  } catch (failure) {
    setMeta(LOCATION_KEYS.active, "0");
    writeError(failure?.message ?? "Could not start background location.");
    throw failure;
  }
}

/** Stop the service. The last fix stays visible in the app. */
export async function stopLocationShare(reason = null) {
  setMeta(LOCATION_KEYS.active, "0");
  writeError(reason);
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // The service may already be gone after a reboot.
  }
}

/** True when the OS still has the task, even after the app was killed. */
export async function isLocationShareRunning() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}
