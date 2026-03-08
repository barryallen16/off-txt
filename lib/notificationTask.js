import { AppRegistry } from "react-native";
import { RNAndroidNotificationListenerHeadlessJsName } from "react-native-android-notification-listener";
import * as Notifications from "expo-notifications";
import { extractUpiLink, parseUpiLink } from "./upi";
import { saveRequest } from "./db";

export const CHANNEL_ID = "payment-requests";

export async function ensureNotificationChannel() {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Payment requests",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/**
 * Runs while the app is killed. Reads the notification posted by the SMS app,
 * stores the request and posts a local notification that points at the inbox.
 */
async function handleNotification({ notification }) {
  try {
    if (!notification) return;

    const payload =
      typeof notification === "string" ? JSON.parse(notification) : notification;
    const text = payload.text || payload.bigText || payload.title || "";
    if (!text.includes(":txt")) return;

    const link = extractUpiLink(text);
    if (!link) return;

    const parsed = parseUpiLink(link);
    if (!parsed.valid) return;

    const saved = saveRequest({
      text,
      link,
      payeeName: parsed.pn,
      payeeVpa: parsed.pa,
      amount: parsed.am,
      sender: payload.title || null,
      sourceApp: payload.app || null,
    });
    if (!saved.inserted) return;

    await ensureNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Payment request",
        body: `${parsed.pn || parsed.pa} asked for ₹${parsed.am ?? "any amount"}`,
        data: { requestId: saved.id },
      },
      trigger: { channelId: CHANNEL_ID },
    });
  } catch (error) {
    console.error("Notification listener failed:", error);
  }
}

AppRegistry.registerHeadlessTask(
  RNAndroidNotificationListenerHeadlessJsName,
  () => handleNotification,
);
