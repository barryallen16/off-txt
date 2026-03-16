// Thin wrapper around the local native module. Everything degrades to
// "unavailable" instead of throwing so the screens can explain themselves.

import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";
import * as SMS from "expo-sms";

const native = Platform.OS === "android" ? requireOptionalNativeModule("OffTxtSms") : null;

export const nativeSmsAvailable = native != null;

export function hasSendPermission() {
  try {
    return native ? native.hasSendPermission() : false;
  } catch {
    return false;
  }
}

export function hasReadPermission() {
  try {
    return native ? native.hasReadPermission() : false;
  } catch {
    return false;
  }
}

/**
 * Ask for SEND_SMS, and optionally READ_SMS.
 * @param {{ read?: boolean }} [options]
 */
export async function requestSmsPermissions({ read = true } = {}) {
  if (Platform.OS !== "android") return false;

  const wanted = [PermissionsAndroid.PERMISSIONS.SEND_SMS];
  if (read) wanted.push(PermissionsAndroid.PERMISSIONS.READ_SMS);

  const result = await PermissionsAndroid.requestMultiple(wanted);
  const granted = wanted.every(
    (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );
  return granted;
}

/**
 * Make sure we may send silently. Returns false when the user says no.
 */
export async function ensureSendPermission() {
  if (hasSendPermission()) return true;
  return requestSmsPermissions({ read: true });
}

/**
 * Send pre-built parts as one conversation message.
 * Falls back to the compose screen when the native module is missing, which
 * needs a tap from the user.
 * @param {string} address
 * @param {string[]} parts
 * @returns {Promise<{ sent: boolean, segments: number, reason: string | null }>}
 */
export async function sendParts(address, parts) {
  if (!address || !parts?.length) {
    return { sent: false, segments: 0, reason: "No recipient." };
  }

  if (native && hasSendPermission()) {
    try {
      const segments = await native.sendParts(address, parts);
      return { sent: true, segments: Number(segments) || parts.length, reason: null };
    } catch (error) {
      return {
        sent: false,
        segments: 0,
        reason: error?.message ?? "The phone rejected the message.",
      };
    }
  }

  const available = await SMS.isAvailableAsync();
  if (!available) {
    return { sent: false, segments: 0, reason: "SMS is not available." };
  }

  const { result } = await SMS.sendSMSAsync([address], parts.join(""));
  return {
    sent: result === "sent",
    segments: parts.length,
    reason: result === "sent" ? null : "Message left unsent.",
  };
}

/**
 * Read the SMS inbox since a timestamp. Used to pick up every part of a
 * multipart payload.
 * @param {number} sinceMs
 * @param {number} limit
 * @returns {Promise<Array<{ id: number, address: string, body: string, date: number }>>}
 */
export async function readRecent(sinceMs, limit = 50) {
  if (!native || !hasReadPermission()) return [];
  try {
    const rows = await native.readRecent(limit, sinceMs);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
