import { AppRegistry } from "react-native";
import { RNAndroidNotificationListenerHeadlessJsName } from "react-native-android-notification-listener";
import { extractUpiLinks, parseUpiLink } from "./upi";
import { saveRequest } from "./db";
import { ingestSms, notifyPaymentRequest } from "./ingest";
import { isTransferText } from "./transfer";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A messaging app can put the body in any of these fields, depending on the
 * version and whether it grouped several messages into one summary. Check all
 * of them, plus the per-message lines of a grouped notification.
 */
function collectTexts(payload) {
  const items = [];
  const seen = new Set();
  const fallbackSender = clean(payload.title) || clean(payload.subText) || null;

  for (const key of [
    "bigText",
    "text",
    "titleBig",
    "title",
    "subText",
    "summaryText",
    "extraInfoText",
  ]) {
    const text = clean(payload[key]);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push({ text, sender: fallbackSender });
  }

  const groups = Array.isArray(payload.groupedMessages)
    ? payload.groupedMessages
    : [];

  for (const group of groups) {
    const text = clean(group?.text);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push({ text, sender: clean(group?.title) || fallbackSender });
  }

  return items;
}

async function saveRequestNotification({ text, sender, sourceApp, seenLinks }) {
  const links = extractUpiLinks(text);
  if (links.length === 0) return;

  for (const link of links) {
    if (seenLinks.has(link)) continue;

    const parsed = parseUpiLink(link);
    if (!parsed.valid) continue;
    seenLinks.add(link);

    const saved = saveRequest({
      text,
      link,
      payeeName: parsed.pn,
      payeeVpa: parsed.pa,
      amount: parsed.am,
      sender,
      sourceApp,
    });
    if (!saved.inserted) continue;

    await notifyPaymentRequest({
      id: saved.id,
      name: parsed.pn,
      vpa: parsed.pa,
      amount: parsed.am,
    });
  }
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
    const receivedAt = Number(payload?.time) || Date.now();
    const sourceApp = clean(payload?.app) || null;
    const seenLinks = new Set();

    for (const item of collectTexts(payload ?? {})) {
      // Shared pictures, QR codes and location pings arrive here first. Long
      // notification text is often shortened, so whatever is missing is picked
      // up by the inbox sync when the app opens.
      if (isTransferText(item.text)) {
        await ingestSms({
          body: item.text,
          address: item.sender,
          receivedAt,
        });
      }

      // A colon prefix keeps ordinary UPI links in other apps from turning
      // into payment requests.
      if (item.text.includes(":txt")) {
        await saveRequestNotification({
          text: item.text,
          sender: item.sender,
          sourceApp,
          seenLinks,
        });
      }
    }
  } catch (error) {
    console.error("Notification listener failed:", error);
  }
}

AppRegistry.registerHeadlessTask(
  RNAndroidNotificationListenerHeadlessJsName,
  () => handleNotification,
);
