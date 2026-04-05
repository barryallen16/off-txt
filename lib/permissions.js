// One place to read and request every permission the app needs. The setup
// screen and the home banner both use this so they never disagree.

import { Linking, PermissionsAndroid, Platform } from "react-native";
import * as Camera from "expo-camera";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import RNAndroidNotificationListener from "react-native-android-notification-listener";
import { hasReadPermission, hasSendPermission, requestSmsPermissions } from "./sms";

async function androidPermission(permission, nativeCheck) {
  if (Platform.OS !== "android") return false;
  if (nativeCheck()) return true;
  try {
    return await PermissionsAndroid.check(permission);
  } catch {
    return false;
  }
}

export async function getPermissionSnapshot() {
  const [contacts, camera, location, notifications] = await Promise.all([
    Contacts.getPermissionsAsync().catch(() => ({ status: "undetermined" })),
    Camera.getCameraPermissionsAsync().catch(() => ({ status: "undetermined" })),
    Location.getForegroundPermissionsAsync().catch(() => ({
      status: "undetermined",
    })),
    Notifications.getPermissionsAsync().catch(() => ({ granted: false })),
  ]);

  const smsSend = await androidPermission(
    PermissionsAndroid.PERMISSIONS.SEND_SMS,
    hasSendPermission,
  );
  const smsRead = await androidPermission(
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    hasReadPermission,
  );

  let notificationListener = "unavailable";
  if (Platform.OS === "android") {
    try {
      const status = await RNAndroidNotificationListener.getPermissionStatus();
      notificationListener = status === "authorized" ? "authorized" : "missing";
    } catch {
      notificationListener = "missing";
    }
  }

  return {
    smsSend,
    smsRead,
    sms: smsSend && smsRead,
    contacts: contacts.status === "granted",
    contactsCanAsk: contacts.canAskAgain !== false,
    camera: camera.status === "granted",
    cameraCanAsk: camera.canAskAgain !== false,
    location: location.status === "granted",
    locationCanAsk: location.canAskAgain !== false,
    notifications: notifications.granted === true,
    notificationsCanAsk: notifications.canAskAgain !== false,
    notificationListener,
  };
}

/** True when a fresh install still needs to finish setup. */
export function needsSetup(snapshot) {
  if (!snapshot) return false;
  if (Platform.OS !== "android") return false;
  return (
    snapshot.notificationListener !== "authorized" ||
    !snapshot.smsSend ||
    !snapshot.smsRead
  );
}

export async function requestSmsAccess() {
  if (Platform.OS !== "android") return false;
  return requestSmsPermissions({ read: true });
}

export async function requestContactsAccess() {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === "granted";
}

export async function requestCameraAccess() {
  const { status } = await Camera.requestCameraPermissionsAsync();
  return status === "granted";
}

export async function requestLocationAccess() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function requestNotificationAccess() {
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

export function requestNotificationListenerAccess() {
  if (Platform.OS !== "android") return;
  RNAndroidNotificationListener.requestPermission();
}

export function openAppSettings() {
  Linking.openSettings().catch(() => {});
}
