// Reads the SMS inbox for parts the notification path could not see. Android
// joins multipart SMS segments into one body, so one row can hold a whole
// transfer. Requests are read from here too: if notification access is off or
// the listener missed a message, the link still lands in Requests.

import { DeviceEventEmitter } from "react-native";
import {
  getMeta,
  isSmsSeen,
  markSmsSeen,
  saveRequest,
  setMeta,
} from "./db";
import { ingestSms, notifyPaymentRequest } from "./ingest";
import { hasReadPermission, readRecent } from "./sms";
import { isTransferText } from "./transfer";
import { extractUpiLinks, parseUpiLink } from "./upi";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const MAX_LOOKBACK = 30 * DAY;
const OVERLAP = 10 * MINUTE;
const RECENT = 2 * MINUTE;

export const INBOX_SYNCED_EVENT = "offtxt:inbox-synced";

let running = null;

/**
 * @param {{ lookbackMs?: number, limit?: number, force?: boolean }} [options]
 * @returns {Promise<number>} how many transfers were completed
 */
export async function syncInbox({
  lookbackMs,
  limit = 1000,
  force = false,
} = {}) {
  if (running) return running;
  if (!hasReadPermission()) return 0;

  running = (async () => {
    try {
      const now = Date.now();
      const last = Number(getMeta("inbox_synced_at")) || 0;
      const fullScanDone = getMeta("inbox_full_scan") === "1";

      let since;
      if (lookbackMs != null) {
        since = now - lookbackMs;
      } else if (last && fullScanDone) {
        // Re-read a small overlap so a message that landed while the last sync
        // was running is not skipped.
        since = Math.max(now - MAX_LOOKBACK, last - OVERLAP);
      } else {
        // First run, or an upgrade from the shorter lookback: read the whole
        // window once so old requests are not lost.
        since = now - MAX_LOOKBACK;
      }

      // A manual refresh should find anything missed in the last day even if a
      // previous sync claimed to have seen it.
      if (force) since = Math.min(since, now - DAY);

      const rows = await readRecent(since, limit);
      let completed = 0;
      let changed = false;

      // Oldest first, so parts land in order.
      for (const row of [...rows].reverse()) {
        if (!row || typeof row.body !== "string") continue;
        if (isSmsSeen(row.id)) continue;

        const hasTransfer = isTransferText(row.body);
        const links = row.body.includes(":txt")
          ? extractUpiLinks(row.body)
          : [];

        if (!hasTransfer && links.length === 0) continue;

        try {
          if (hasTransfer) {
            const result = await ingestSms({
              body: row.body,
              address: row.address || null,
              receivedAt: row.date || now,
              notify: (row.date || 0) > now - RECENT,
              trusted: true,
            });
            const pieces =
              Number(result.completed) > 0
                ? Number(result.completed)
                : result.status === "complete"
                  ? 1
                  : 0;
            completed += pieces;
            if (pieces > 0) changed = true;
          }

          for (const link of links) {
            const parsed = parseUpiLink(link);
            if (!parsed.valid) continue;
            const saved = saveRequest({
              text: row.body,
              link,
              payeeName: parsed.pn,
              payeeVpa: parsed.pa,
              amount: parsed.am,
              sender: row.address || null,
              sourceApp: "sms",
            });
            if (!saved.inserted) continue;

            changed = true;
            // Only announce what just arrived, not a month of old messages
            // uncovered by the first scan.
            if ((row.date || 0) > now - RECENT) {
              await notifyPaymentRequest({
                id: saved.id,
                name: parsed.pn,
                vpa: parsed.pa,
                amount: parsed.am,
              });
            }
          }

          markSmsSeen(row.id);
        } catch {
          // Leave it unseen so the next sync tries again.
        }
      }

      setMeta("inbox_synced_at", now);
      if (!fullScanDone) setMeta("inbox_full_scan", "1");
      if (changed) DeviceEventEmitter.emit(INBOX_SYNCED_EVENT);
      return completed;
    } catch {
      return 0;
    }
  })();

  // Reset only after the promise has been assigned above, even when the body
  // finishes without ever awaiting.
  running = running.finally(() => {
    running = null;
  });

  return running;
}
