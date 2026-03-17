import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("payments.db");

const EXTRA_COLUMNS = {
  payee_name: "TEXT",
  payee_vpa: "TEXT",
  amount: "TEXT",
  sender: "TEXT",
  source_app: "TEXT",
};

let schemaReady = false;

function ensureSchema() {
  if (schemaReady) return;

  db.execSync(`
    CREATE TABLE IF NOT EXISTS received_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT,
      upi_link TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Older installs only have the three columns above, so add the rest in place.
  const existing = new Set(
    db.getAllSync("PRAGMA table_info(received_payments)").map((row) => row.name),
  );
  for (const [name, sqlType] of Object.entries(EXTRA_COLUMNS)) {
    if (!existing.has(name)) {
      db.execSync(`ALTER TABLE received_payments ADD COLUMN ${name} ${sqlType}`);
    }
  }

  db.execSync(`
    CREATE TABLE IF NOT EXISTS transfer_parts (
      transfer_key TEXT NOT NULL,
      seq INTEGER NOT NULL,
      chunk TEXT NOT NULL,
      kind TEXT NOT NULL,
      total INTEGER NOT NULL,
      crc TEXT NOT NULL,
      sender TEXT,
      received_at INTEGER NOT NULL,
      PRIMARY KEY (transfer_key, seq)
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_key TEXT UNIQUE NOT NULL,
      kind TEXT NOT NULL,
      sender TEXT,
      payload TEXT,
      payload_b64 TEXT,
      session TEXT,
      received_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seen_sms (
      sms_id INTEGER PRIMARY KEY,
      seen_at INTEGER NOT NULL
    );
  `);

  schemaReady = true;
}

/**
 * Store a request once. A second notification with the same link and text
 * inside two minutes is considered the same request.
 * @returns {{ inserted: boolean, id: number | null }}
 */
export function saveRequest({
  text,
  link,
  payeeName = null,
  payeeVpa = null,
  amount = null,
  sender = null,
  sourceApp = null,
}) {
  ensureSchema();

  const duplicate = db.getFirstSync(
    `SELECT id FROM received_payments
      WHERE upi_link = ? AND original_text = ?
        AND received_at >= datetime('now', '-2 minutes')
      LIMIT 1`,
    [link, text],
  );
  if (duplicate) return { inserted: false, id: duplicate.id };

  const result = db.runSync(
    `INSERT INTO received_payments
      (original_text, upi_link, payee_name, payee_vpa, amount, sender, source_app)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [text, link, payeeName, payeeVpa, amount, sender, sourceApp],
  );

  return { inserted: true, id: result.lastInsertRowId };
}

/** Newest first. */
export function listRequests() {
  ensureSchema();
  return db.getAllSync("SELECT * FROM received_payments ORDER BY id DESC");
}

/**
 * Remember one part of a chunked transfer.
 * @returns {number} how many distinct parts are stored for this transfer
 */
export function savePart({
  transferKey,
  seq,
  chunk,
  kind,
  total,
  crc,
  sender = null,
  receivedAt = Date.now(),
}) {
  ensureSchema();

  db.runSync(
    `INSERT OR IGNORE INTO transfer_parts
      (transfer_key, seq, chunk, kind, total, crc, sender, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [transferKey, seq, chunk, kind, total, crc, sender, receivedAt],
  );

  const row = db.getFirstSync(
    "SELECT COUNT(*) AS count, MIN(received_at) AS firstAt FROM transfer_parts WHERE transfer_key = ?",
    [transferKey],
  );
  return { count: row?.count ?? 0, firstAt: row?.firstAt ?? receivedAt };
}

/** Parts of one transfer, ordered. */
export function listParts(transferKey) {
  ensureSchema();
  return db.getAllSync(
    "SELECT seq, chunk, kind, total, crc FROM transfer_parts WHERE transfer_key = ? ORDER BY seq",
    [transferKey],
  );
}

export function dropParts(transferKey) {
  ensureSchema();
  db.runSync("DELETE FROM transfer_parts WHERE transfer_key = ?", [transferKey]);
}

/** Drop half-received transfers that will never finish. */
export function pruneParts(olderThanMs = 24 * 60 * 60 * 1000) {
  ensureSchema();
  db.runSync("DELETE FROM transfer_parts WHERE received_at < ?", [
    Date.now() - olderThanMs,
  ]);
}

/**
 * Store a complete transfer exactly once.
 * @returns {{ inserted: boolean, id: number | null }}
 */
export function saveTransfer({
  transferKey,
  kind,
  sender = null,
  payload = null,
  payloadB64 = null,
  session = null,
  receivedAt = Date.now(),
}) {
  ensureSchema();

  const existing = db.getFirstSync(
    "SELECT id FROM transfers WHERE transfer_key = ?",
    [transferKey],
  );
  if (existing) return { inserted: false, id: existing.id };

  const result = db.runSync(
    `INSERT INTO transfers
      (transfer_key, kind, sender, payload, payload_b64, session, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [transferKey, kind, sender, payload, payloadB64, session, receivedAt],
  );

  return { inserted: true, id: result.lastInsertRowId };
}

/** Newest first. */
export function listTransfers() {
  ensureSchema();
  return db.getAllSync("SELECT * FROM transfers ORDER BY id DESC");
}

export function getTransfer(id) {
  ensureSchema();
  return db.getFirstSync("SELECT * FROM transfers WHERE id = ?", [id]) ?? null;
}

/** Inbox rows can be read again on every foreground sync. */
export function isSmsSeen(smsId) {
  ensureSchema();
  return (
    db.getFirstSync("SELECT sms_id FROM seen_sms WHERE sms_id = ?", [smsId]) !=
    null
  );
}

export function markSmsSeen(smsId) {
  ensureSchema();
  db.runSync("INSERT OR IGNORE INTO seen_sms (sms_id, seen_at) VALUES (?, ?)", [
    smsId,
    Date.now(),
  ]);
}

/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS". */
export function toDate(receivedAt) {
  if (!receivedAt) return new Date();
  const parsed = new Date(String(receivedAt).replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
