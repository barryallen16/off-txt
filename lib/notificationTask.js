import { AppRegistry } from "react-native";
import { RNAndroidNotificationListenerHeadlessJsName } from "react-native-android-notification-listener";
import * as Notifications from "expo-notifications";
import { extractUpiLink, parseUpiLink } from "./upi";
import { saveRequest } from "./db";
import { ingestSms } from "./ingest";
import { isTransferText } from "./transfer";

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
    const text = payload.bigText || payload.text || payload.title || "";
    const isRequest = text.includes(":txt");

    // Shared pictures, QR codes and location pings arrive here first. Long
    // notification text is often shortened, so whatever is missing is picked
    // up by the inbox sync when the app opens.
    if (isTransferText(text)) {
      await ingestSms({
        body: text,
        address: payload.title || null,
        receivedAt: Date.now(),
      });
    }

    if (!isRequest) return;

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
