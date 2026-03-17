// Takes an SMS body, stitches the parts together and stores the result.
// Both the killed-app notification listener and the foreground inbox sync call
// this, so a transfer survives either path.

import * as Notifications from "expo-notifications";
import { encodeBase64 } from "./base64";
import {
  dropParts,
  listParts,
  pruneParts,
  savePart,
  saveTransfer,
} from "./db";
import { decodeLocation } from "./geo";
import { KIND, assemble, parsePart } from "./transfer";

export const TRANSFER_CHANNEL = "transfers";

export async function ensureTransferChannel() {
  await Notifications.setNotificationChannelAsync(TRANSFER_CHANNEL, {
    name: "Shared items",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

function summary(kind, sender) {
  const who = sender || "Someone";
  if (kind === KIND.LOCATION) return `${who} shared a location`;
  if (kind === KIND.QR) return `${who} sent a QR code`;
  if (kind === KIND.IMAGE) return `${who} sent a picture`;
  return `${who} sent something`;
}

async function notify(kind, sender, id) {
  try {
    await ensureTransferChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "off-txt",
        body: summary(kind, sender),
        data: { transferId: id },
      },
      trigger: { channelId: TRANSFER_CHANNEL },
    });
  } catch {
    // Notifications can be denied; the item is in the inbox either way.
  }
}

/**
 * @param {{ body: string, address?: string | null, receivedAt?: number, notify?: boolean }} sms
 * @returns {Promise<{ status: "ignored" | "partial" | "complete" | "error", transfer?: object, id?: string }>}
 */
export async function ingestSms({
  body,
  address = null,
  receivedAt = Date.now(),
  notify: shouldNotify = true,
}) {
  const part = parsePart(body);
  if (!part) return { status: "ignored" };

  // The id alone is the key: the same message can reach us once as a
  // notification (contact name) and once from the inbox (phone number), and
  // those must not become two half transfers.
  const transferKey = part.id;

  const { count } = savePart({
    transferKey,
    seq: part.seq,
    chunk: part.chunk,
    kind: part.kind,
    total: part.total,
    crc: part.crc,
    sender: address,
    receivedAt,
  });

  if (count < part.total) {
    return { status: "partial", id: transferKey };
  }

  const result = assemble(listParts(transferKey));
  if (result.error || !result.complete) {
    dropParts(transferKey);
    return { status: "error", id: transferKey };
  }

  let payload = null;
  let payloadB64 = null;
  let session = null;

  if (part.kind === KIND.IMAGE) {
    payloadB64 = encodeBase64(result.bytes);
  } else {
    payload = result.text;
    if (part.kind === KIND.LOCATION) {
      session = decodeLocation(payload)?.session ?? null;
    }
  }

  const stored = saveTransfer({
    transferKey,
    kind: part.kind,
    sender: address,
    payload,
    payloadB64,
    session,
    receivedAt,
  });

  dropParts(transferKey);
  pruneParts();

  if (stored.inserted && shouldNotify) {
    await notify(part.kind, address, stored.id);
  }

  return { status: "complete", id: transferKey, transfer: stored };
}
