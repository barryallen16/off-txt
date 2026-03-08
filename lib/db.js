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

/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS". */
export function toDate(receivedAt) {
  if (!receivedAt) return new Date();
  const parsed = new Date(String(receivedAt).replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
