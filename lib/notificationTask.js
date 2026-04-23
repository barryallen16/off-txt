import { AppRegistry } from "react-native";
import { RNAndroidNotificationListenerHeadlessJsName } from "react-native-android-notification-listener";
import { extractUpiLinks, hasRequestTrigger, parseUpiLink } from "./upi";
import { saveRequest } from "./db";
import {
  ingestSms,
  maybePruneParts,
  notifyPaymentRequest,
} from "./ingest";
import { loadPhoneContacts } from "./contacts";
import { isPhoneSender, normalizeSender } from "./sender";
import { MARKER, isTransferText } from "./transfer";

const SELF_PACKAGE = "com.barryallen16.offtxt";

// NotificationListenerService sees every app on the phone. These are the SMS
// packages we recognise; an unknown app still gets through when its text
// clearly carries one of our markers, so a non-listed messaging app keeps
// working without waking the JS engine for every social notification.
const SMS_PACKAGES = new Set([
  "com.google.android.apps.messaging",
  "com.samsung.android.messaging",
  "com.android.messaging",
  "com.android.mms",
  "com.miui.smsextra",
  "com.miui.mms",
  "com.oneplus.mms",
  "com.oneplus.messaging",
  "com.coloros.sms",
  "com.oppo.sms",
  "com.vivo.mms",
  "com.bbk.mmss",
  "com.huawei.message",
  "com.mediatek.mms",
  "com.microsoft.android.smsorganizer",
  "com.textra",
  "org.thoughtcrime.securesms",
  "com.simplemobiletools.smsmessenger",
]);

let contactCacheAt = 0;
let contactsByName = new Map();

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** A notification often names the contact while the inbox has the address. */
async function canonicalSender(value) {
  const normalized = normalizeSender(value);
  if (!normalized || isPhoneSender(normalized)) return normalized;

  if (Date.now() - contactCacheAt > 10 * 60 * 1000) {
    try {
      const rows = await loadPhoneContacts();
      const byName = new Map();
      for (const row of rows) {
        const key = row.name.trim().toLowerCase();
        if (key && !byName.has(key)) byName.set(key, row.number);
      }
      contactsByName = byName;
    } catch {
      contactsByName = new Map();
    }
    contactCacheAt = Date.now();
  }

  const key = normalized.toLowerCase();
  const number = contactsByName.get(key);
  return number ? normalizeSender(number) : normalized;
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

function mayBeSms(payload, texts) {
  const app = clean(payload.app).toLowerCase();
  if (app === SELF_PACKAGE) return false;
  if (!app || SMS_PACKAGES.has(app)) return true;

  return texts.some(
    (item) => item.text.includes(MARKER) || hasRequestTrigger(item.text),
  );
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
    const texts = collectTexts(payload ?? {});

    if (!mayBeSms(payload ?? {}, texts)) return;

    const senders = new Map();

    for (const item of texts) {
      // Shared pictures, QR codes and location pings arrive here first. Long
      // notification text is often shortened, so whatever is missing is picked
      // up by the inbox sync when the app opens.
      if (isTransferText(item.text)) {
        if (!senders.has(item.sender)) {
          senders.set(item.sender, await canonicalSender(item.sender));
        }
        await ingestSms({
          body: item.text,
          address: senders.get(item.sender),
          receivedAt,
        });
      }

      // A colon prefix keeps ordinary UPI links in other apps from turning
      // into payment requests. The trigger is case-insensitive because a
      // keyboard can capitalise the first letter of a forwarded message.
      if (hasRequestTrigger(item.text)) {
        if (!senders.has(item.sender)) {
          senders.set(item.sender, await canonicalSender(item.sender));
        }
        await saveRequestNotification({
          text: item.text,
          sender: senders.get(item.sender),
          sourceApp,
          seenLinks,
        });
      }
    }

    maybePruneParts();
  } catch (error) {
    console.error("Notification listener failed:", error);
  }
}

AppRegistry.registerHeadlessTask(
  RNAndroidNotificationListenerHeadlessJsName,
  () => handleNotification,
);
