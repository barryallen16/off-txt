import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("payments.db");

const EXTRA_COLUMNS = {
  payee_name: "TEXT",
  payee_vpa: "TEXT",
  amount: "TEXT",
  sender: "TEXT",
  source_app: "TEXT",
  status: "TEXT DEFAULT 'open'",
  handled_at: "INTEGER",
};

let schemaReady = false;

function ensureSchema() {
  if (schemaReady) return;

  db.execSync(`
    CREATE TABLE IF NOT EXISTS received_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT,
      upi_link TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      payee_name TEXT,
      payee_vpa TEXT,
      amount TEXT,
      sender TEXT,
      source_app TEXT,
      status TEXT DEFAULT 'open',
      handled_at INTEGER
    );
  `);

  // Older installs only have the first three columns, so add the rest in place.
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
      trusted INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS favorites (
      number TEXT PRIMARY KEY,
      name TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const partColumns = new Set(
    db.getAllSync("PRAGMA table_info(transfer_parts)").map((row) => row.name),
  );
  if (!partColumns.has("trusted")) {
    db.execSync(
      "ALTER TABLE transfer_parts ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0",
    );
  }

  schemaReady = true;
}

/**
 * Store a request once. The same link is the same request while it is still
 * open, or when it arrives twice within two minutes.
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
      WHERE upi_link = ?
        AND (
          received_at >= datetime('now', '-2 minutes')
          OR COALESCE(status, 'open') = 'open'
        )
      LIMIT 1`,
    [link],
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

/**
 * Requests that still need an action. Pass "history" for everything that was
 * marked done or dismissed, or "all" for both.
 */
export function listRequests(status = "open") {
  ensureSchema();

  if (status === "history") {
    return db.getAllSync(
      `SELECT * FROM received_payments
        WHERE COALESCE(status, 'open') IN ('done', 'dismissed')
        ORDER BY handled_at DESC, id DESC`,
    );
  }

  if (status === "all") {
    return db.getAllSync("SELECT * FROM received_payments ORDER BY id DESC");
  }

  return db.getAllSync(
    `SELECT * FROM received_payments
      WHERE COALESCE(status, 'open') = 'open'
      ORDER BY id DESC`,
  );
}

export function listHistoryRequests() {
  return listRequests("history");
}

/** @param {number} id @param {"open" | "done" | "dismissed"} status */
export function setRequestStatus(id, status) {
  ensureSchema();
  const next =
    status === "done" || status === "dismissed" ? status : "open";

  db.runSync(
    "UPDATE received_payments SET status = ?, handled_at = ? WHERE id = ?",
    [next, next === "open" ? null : Date.now(), id],
  );

  return next;
}

export function getMeta(key) {
  ensureSchema();
  const row = db.getFirstSync("SELECT value FROM app_meta WHERE key = ?", [key]);
  return row?.value ?? null;
}

export function setMeta(key, value) {
  ensureSchema();
  db.runSync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value == null ? null : String(value)],
  );
}

export function listFavorites() {
  ensureSchema();
  return db.getAllSync(
    "SELECT number, name FROM favorites ORDER BY name COLLATE NOCASE ASC, number ASC",
  );
}

export function isFavorite(number) {
  ensureSchema();
  return (
    db.getFirstSync("SELECT number FROM favorites WHERE number = ?", [number]) !=
    null
  );
}

export function addFavorite({ number, name = null }) {
  ensureSchema();
  db.runSync(
    `INSERT INTO favorites (number, name, created_at) VALUES (?, ?, ?)
      ON CONFLICT(number) DO UPDATE SET name = excluded.name`,
    [number, name, Date.now()],
  );
}

export function removeFavorite(number) {
  ensureSchema();
  db.runSync("DELETE FROM favorites WHERE number = ?", [number]);
}

/**
 * @returns {boolean} true when the contact is now a favorite
 */
export function toggleFavorite({ number, name = null }) {
  if (isFavorite(number)) {
    removeFavorite(number);
    return false;
  }
  addFavorite({ number, name });
  return true;
}

/**
 * Remember one part of a chunked transfer. A notification can only show a
 * shortened copy of a long SMS, so the inbox copy is trusted and always
 * replaces the stored one. A notification chunk only fills a missing part or
 * replaces a longer untrusted copy.
 * @returns {{ count: number, firstAt: number }} how many distinct parts are stored
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
  trusted = false,
}) {
  ensureSchema();

  db.runSync(
    `INSERT INTO transfer_parts
      (transfer_key, seq, chunk, kind, total, crc, sender, received_at, trusted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transfer_key, seq) DO UPDATE SET
        chunk = excluded.chunk,
        sender = COALESCE(transfer_parts.sender, excluded.sender),
        trusted = excluded.trusted
      WHERE excluded.trusted = 1
        OR (
          transfer_parts.trusted = 0
          AND length(excluded.chunk) > length(transfer_parts.chunk)
        )`,
    [
      transferKey,
      seq,
      chunk,
      kind,
      total,
      crc,
      sender,
      receivedAt,
      trusted ? 1 : 0,
    ],
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
  return db.getAllSync(
    "SELECT * FROM transfers ORDER BY received_at DESC, id DESC",
  );
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
