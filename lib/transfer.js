// Chunked SMS transport for small payloads.
//
// A part is a fixed-width header plus a base64 chunk:
//
//   ot1.<id>.<kind>.<seq>.<total>.<crc>.<chunk>
//
// Every field is base36 and every character is in the GSM-7 default alphabet
// (base64's + / = are too), so one 153 character part is one SMS segment.
// Chunks are concatenated before base64 decoding, so a chunk may end
// mid-quantum.

import { decodeBase64, encodeBase64, utf8Bytes, utf8Text } from "./base64";

export const MARKER = "ot1.";
/** GSM-7 multipart payload, conservative: 153 chars per segment. */
export const SEGMENT_CHARS = 153;

export const KIND = {
  TEXT: "t",
  QR: "q",
  LOCATION: "g",
  IMAGE: "i",
};

/** A full 32-bit CRC32 needs seven base-36 characters. */
export const CRC_CHARS = 7;

const HEADER_CHARS = MARKER.length + 4 + 1 + 1 + 1 + 2 + 1 + 2 + 1 + CRC_CHARS + 1;
/** 153 - 25 = 128 */
export const CHUNK_CHARS = SEGMENT_CHARS - HEADER_CHARS;
const MAX_PARTS = 36 * 36 - 1;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function base36(number, width) {
  return Math.max(0, Math.trunc(number))
    .toString(36)
    .padStart(width, "0")
    .slice(-width);
}

/**
 * Encode the whole 32-bit CRC. 36^6 is smaller than 2^32, so seven characters
 * are required; the old four-character field kept only about 20 bits.
 * @param {number} value
 */
export function formatCrc(value) {
  return (value >>> 0).toString(36).padStart(CRC_CHARS, "0");
}

function randomId() {
  // Four base36 characters, 1.6 million possibilities. The receiver only needs
  // uniqueness among the parts that are alive at the same time.
  return base36(Math.floor(Math.random() * 36 ** 4), 4);
}

/** @param {Uint8Array | string} payload */
function toBytes(payload) {
  return typeof payload === "string" ? utf8Bytes(payload) : payload;
}

/** How many SMS segments a payload needs, header included. */
export function partCount(payload) {
  const bytes = toBytes(payload);
  const encoded = encodeBase64(bytes);
  return Math.max(1, Math.ceil(encoded.length / CHUNK_CHARS));
}

/** How many SMS segments an already base64-encoded payload needs. */
export function partCountEncoded(encoded) {
  return Math.max(1, Math.ceil(String(encoded ?? "").length / CHUNK_CHARS));
}

function buildTransfer(kind, encoded, bytes, options) {
  const id = options.id ?? randomId();
  const total = partCountEncoded(encoded);
  if (total > MAX_PARTS) {
    throw new Error(`Payload needs ${total} parts, the limit is ${MAX_PARTS}`);
  }
  const crc = formatCrc(crc32(bytes));
  const parts = [];

  for (let seq = 0; seq < total; seq++) {
    const chunk = encoded.slice(seq * CHUNK_CHARS, (seq + 1) * CHUNK_CHARS);
    parts.push(
      `${MARKER}${id}.${kind}.${base36(seq, 2)}.${base36(total, 2)}.${crc}.${chunk}`,
    );
  }

  return { id, kind, total, parts };
}

/**
 * Split a payload into SMS bodies that can go out as one multipart message.
 * @param {string} kind one of KIND
 * @param {Uint8Array | string} payload
 * @param {{ id?: string }} [options]
 * @returns {{ id: string, kind: string, total: number, parts: string[] }}
 */
export function encodeTransfer(kind, payload, options = {}) {
  const bytes = toBytes(payload);
  return buildTransfer(kind, encodeBase64(bytes), bytes, options);
}

/**
 * Same as {@link encodeTransfer}, for a payload that is already base64. Images
 * arrive from the compressor as base64, so decoding and re-encoding twice is
 * wasted memory.
 * @param {string} kind
 * @param {string} base64
 * @param {{ id?: string }} [options]
 */
export function encodeTransferFromBase64(kind, base64, options = {}) {
  const encoded = String(base64 ?? "").replace(/[^A-Za-z0-9+/=]/g, "");
  return buildTransfer(kind, encoded, decodeBase64(encoded), options);
}

const PART = /^([0-9a-z]{4})\.([a-z])\.([0-9a-z]{2})\.([0-9a-z]{2})\.([0-9a-z]{7})\.([A-Za-z0-9+/=]*)/;

function parsePiece(piece) {
  const match = piece.match(PART);
  if (!match) return null;

  const seq = parseInt(match[3], 36);
  const total = parseInt(match[4], 36);
  if (!Number.isFinite(seq) || !Number.isFinite(total)) return null;
  if (total < 1 || total > MAX_PARTS || seq >= total) return null;

  return {
    id: match[1],
    kind: match[2],
    seq,
    total,
    crc: match[5],
    chunk: match[6],
  };
}

/**
 * Find every transfer part inside any text. Android joins the segments of a
 * multipart SMS into one body, so one message can hold the whole transfer:
 * "ot1.aaa...ot1.bbb...". Splitting on the marker is safe because a dot can
 * never appear inside a base64 chunk.
 * @param {string} text
 * @returns {Array<{ id: string, kind: string, seq: number, total: number, crc: string, chunk: string }>}
 */
export function parseParts(text) {
  if (typeof text !== "string") return [];

  const parts = [];
  for (const piece of text.split(MARKER).slice(1)) {
    const part = parsePiece(piece);
    if (part) parts.push(part);
  }
  return parts;
}

/**
 * Find the first transfer part inside any text. The marker is searched for, so
 * a notification title, a carrier prefix or trailing signature does not matter.
 * @param {string} text
 * @returns {{ id: string, kind: string, seq: number, total: number, crc: string, chunk: string } | null}
 */
export function parsePart(text) {
  return parseParts(text)[0] ?? null;
}

/** True when the text carries at least one transfer part. */
export function isTransferText(text) {
  return parsePart(text) != null;
}

/**
 * The most common value. Every header repeats the total, kind and checksum, so
 * a single bit-flipped part cannot poison the transfer.
 * @template T
 * @param {T[]} values
 * @returns {T | null}
 */
function mostCommon(values) {
  const counts = new Map();
  let best = null;
  let bestCount = 0;

  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Assemble a set of parsed parts. Missing parts are reported so the caller can
 * keep waiting instead of dropping the transfer.
 * @param {Array<{ seq: number, total: number, crc: string, chunk: string, kind: string }>} parts
 * @returns {{ complete: boolean, missing: number[], kind: string | null, bytes: Uint8Array | null, text: string | null, error: string | null }}
 */
export function assemble(parts) {
  const empty = {
    complete: false,
    missing: [],
    kind: null,
    bytes: null,
    text: null,
    error: null,
  };
  if (!Array.isArray(parts) || parts.length === 0) return empty;

  const total = mostCommon(parts.map((part) => part.total));
  const kind = mostCommon(
    parts.filter((part) => part.total === total).map((part) => part.kind),
  );
  const usable = parts.filter(
    (part) => part.total === total && part.kind === kind,
  );
  const bySeq = new Map();
  for (const part of usable) {
    bySeq.set(part.seq, part);
  }

  const missing = [];
  for (let seq = 0; seq < total; seq++) {
    if (!bySeq.has(seq)) missing.push(seq);
  }
  if (missing.length > 0) {
    return { ...empty, kind, missing };
  }

  let encoded = "";
  for (let seq = 0; seq < total; seq++) encoded += bySeq.get(seq).chunk;

  const bytes = decodeBase64(encoded);
  const actual = formatCrc(crc32(bytes));
  const expected = new Set(usable.map((part) => part.crc));
  if (!expected.has(actual)) {
    return { ...empty, kind, error: "Checksum mismatch" };
  }

  const text = kind === KIND.IMAGE ? null : utf8Text(bytes);
  return { complete: true, missing: [], kind, bytes, text, error: null };
}
