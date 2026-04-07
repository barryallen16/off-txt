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
import { KIND, assemble, parseParts } from "./transfer";

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

async function finishTransfer(part, address, receivedAt, shouldNotify) {
  const transferKey = part.id;
  const result = assemble(listParts(transferKey));

  if (result.error || !result.complete) {
    dropParts(transferKey);
    return null;
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

  return { transferKey, transfer: stored };
}

/**
 * @param {{ body: string, address?: string | null, receivedAt?: number, notify?: boolean, trusted?: boolean }} sms
 * @returns {Promise<{ status: "ignored" | "partial" | "complete" | "error", id?: string, transfer?: object, completed?: number }>}
 */
export async function ingestSms({
  body,
  address = null,
  receivedAt = Date.now(),
  notify: shouldNotify = true,
  trusted = false,
}) {
  const parts = parseParts(body);
  if (parts.length === 0) return { status: "ignored" };

  const done = new Set();
  const waiting = new Set();
  let first = null;

  for (const part of parts) {
    if (done.has(part.id)) continue;

    const { count } = savePart({
      transferKey: part.id,
      seq: part.seq,
      chunk: part.chunk,
      kind: part.kind,
      total: part.total,
      crc: part.crc,
      sender: address,
      receivedAt,
      trusted,
    });

    if (count < part.total) {
      waiting.add(part.id);
      continue;
    }

    const stored = await finishTransfer(
      part,
      address,
      receivedAt,
      shouldNotify,
    );
    waiting.delete(part.id);

    if (!stored) continue;

    done.add(part.id);
    if (!first) first = stored;
  }

  if (done.size > 0) {
    return {
      status: "complete",
      id: first?.transferKey,
      transfer: first?.transfer,
      completed: done.size,
    };
  }

  if (waiting.size > 0) {
    return { status: "partial", id: [...waiting][0], completed: 0 };
  }

  return { status: "error", id: parts[0].id, completed: 0 };
}
