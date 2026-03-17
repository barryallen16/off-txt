// Reads the SMS inbox for parts the notification path could not see. Android
// truncates long notification text, so this is what makes big payloads whole.

import { isSmsSeen, markSmsSeen } from "./db";
import { ingestSms } from "./ingest";
import { hasReadPermission, readRecent } from "./sms";
import { isTransferText } from "./transfer";

let running = false;

/**
 * @param {{ lookbackMs?: number, limit?: number }} [options]
 * @returns {Promise<number>} how many transfers were completed
 */
export async function syncInbox({ lookbackMs = 10 * 60 * 1000, limit = 100 } = {}) {
  if (running || !hasReadPermission()) return 0;
  running = true;

  try {
    const rows = await readRecent(Date.now() - lookbackMs, limit);
    let completed = 0;

    // Oldest first, so parts land in order.
    for (const row of [...rows].reverse()) {
      if (!row || typeof row.body !== "string") continue;
      if (!isTransferText(row.body)) continue;
      if (isSmsSeen(row.id)) continue;

      markSmsSeen(row.id);
      const result = await ingestSms({
        body: row.body,
        address: row.address || null,
        receivedAt: row.date || Date.now(),
      });
      if (result.status === "complete") completed++;
    }

    return completed;
  } catch {
    return 0;
  } finally {
    running = false;
  }
}
