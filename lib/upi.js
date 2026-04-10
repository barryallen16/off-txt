// UPI link parsing and rewriting.
//
// A signed link is kept byte-for-byte whenever it already carries an amount:
// UPI signatures cover every byte before `&sign=`. When a link has to be
// changed (an amount is added, or an unsigned link is normalised), it is
// rebuilt as a small, correctly encoded intent. Merchant-only tags are dropped
// because an unsigned merchant intent makes some UPI apps ignore the amount.

import { decodeBase64, encodeBase64, utf8Bytes, utf8Text } from "./base64";

const UPI_PREFIX = /^upi:\/\/pay\?/i;
const STOP_CHARS = /[\s"'`<>]/;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>»…]+$/;

function splitPairs(query) {
  if (!query) return [];
  return query.split("&").map((raw) => {
    const eq = raw.indexOf("=");
    return eq === -1
      ? { key: raw, value: null, raw }
      : { key: raw.slice(0, eq), value: raw.slice(eq + 1), raw };
  });
}

function decode(value) {
  if (value == null) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function firstValue(pairs, key, { decodeValue = false } = {}) {
  for (const pair of pairs) {
    if (pair.key !== key) continue;
    if (pair.value == null || pair.value === "") continue;
    return decodeValue ? decode(pair.value) : pair.value;
  }
  return null;
}

function withoutNull(value) {
  return value != null && value.toLowerCase() !== "null" ? value : null;
}

/**
 * Normalise a UPI amount to a plain decimal string. Returns null for anything
 * a UPI app would not accept (commas, currency symbols, zero, negative values).
 * @param {string | number | null | undefined} value
 * @returns {string | null}
 */
export function normalizeAmount(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/,/g, "");

  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? String(number) : null;
}

function minAmount(mam) {
  if (mam == null) return null;
  const value = Number(String(mam).trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Parse a UPI intent link without modifying it.
 * @param {string} raw
 */
export function parseUpiLink(raw) {
  const source = typeof raw === "string" ? raw : "";
  const result = {
    raw: source,
    pa: null,
    pn: null,
    am: null,
    mam: null,
    cu: null,
    tn: null,
    tr: null,
    signed: false,
    valid: false,
    reason: null,
  };

  const text = source.trim();
  if (!text) {
    result.reason = "Scan a UPI QR code to start a request.";
    return result;
  }

  const prefix = text.match(UPI_PREFIX);
  if (!prefix) {
    result.reason = "This is not a UPI payment link.";
    return result;
  }

  const pairs = splitPairs(text.slice(prefix[0].length));
  result.pa = firstValue(pairs, "pa", { decodeValue: true });
  result.pn = firstValue(pairs, "pn", { decodeValue: true });
  result.am = withoutNull(firstValue(pairs, "am"));
  result.mam = withoutNull(firstValue(pairs, "mam"));
  result.cu = firstValue(pairs, "cu");
  result.tn = firstValue(pairs, "tn", { decodeValue: true });
  result.tr = firstValue(pairs, "tr", { decodeValue: true });
  result.signed = pairs.some((pair) => pair.key === "sign");

  if (!result.pa) {
    result.reason = "This UPI link has no payee address.";
    return result;
  }
  if (result.cu != null && result.cu.toUpperCase() !== "INR") {
    result.reason = "Only INR payments are supported.";
    return result;
  }

  result.valid = true;
  return result;
}

/**
 * Build the smallest valid intent for a request.
 *
 * `mc`, `mid`, `mode`, `url` and `sign` are deliberately left out. Once an
 * amount is added to a signed merchant QR the signature cannot be kept, and a
 * half-merchant intent is what makes some PSP apps open the pay screen with an
 * empty amount. A plain intent still pays the same VPA, and `tr`/`tn` keep the
 * order reference and note.
 * @param {ReturnType<typeof parseUpiLink>} parsed
 * @param {string} amount
 */
function cleanLink(parsed, amount) {
  const params = [];
  const add = (key, value) => {
    if (value == null || value === "") return;
    params.push(`${key}=${encodeURIComponent(value)}`);
  };

  add("pa", parsed.pa);
  add("pn", parsed.pn);
  add("am", amount);
  add("cu", "INR");
  add("tr", parsed.tr);
  add("tn", parsed.tn);

  return "upi://pay?" + params.join("&");
}

/**
 * Add or normalise the amount on a UPI link.
 *
 * - A signed link that already has a usable amount is returned untouched so
 *   the signature stays valid.
 * - Every other link with a usable amount is rebuilt as a clean intent. This
 *   also fixes links whose values contain raw spaces from route params.
 * - When no amount can be found the original link is returned unchanged.
 * @param {string} raw
 * @param {string} amount
 * @returns {{ link: string, strippedSignature: boolean, amount: string | null }}
 */
export function buildRequestLink(raw, amount) {
  const parsed = parseUpiLink(raw);
  if (!parsed.valid) {
    return { link: parsed.raw, strippedSignature: false, amount: null };
  }

  const linkAmount = normalizeAmount(parsed.am);
  const finalAmount = linkAmount ?? normalizeAmount(amount);

  if (parsed.signed && linkAmount) {
    return {
      link: parsed.raw,
      strippedSignature: false,
      amount: linkAmount,
    };
  }

  if (!finalAmount) {
    return { link: parsed.raw, strippedSignature: false, amount: null };
  }

  return {
    link: cleanLink(parsed, finalAmount),
    strippedSignature: parsed.signed,
    amount: finalAmount,
  };
}

/**
 * Find every UPI link in a message.
 * @param {string} text
 * @returns {string[]}
 */
export function extractUpiLinks(text) {
  if (typeof text !== "string") return [];

  const lower = text.toLowerCase();
  const links = [];
  const seen = new Set();
  let from = 0;

  while (from < text.length) {
    const start = lower.indexOf("upi://pay?", from);
    if (start === -1) break;

    let end = start;
    while (end < text.length && !STOP_CHARS.test(text[end])) end++;

    const link = text.slice(start, end).replace(TRAILING_PUNCTUATION, "");
    if (link && !seen.has(link)) {
      seen.add(link);
      links.push(link);
    }

    from = Math.max(end, start + 1);
  }

  return links;
}

/**
 * Find the first UPI link anywhere in a message.
 * @param {string} text
 * @returns {string | null}
 */
export function extractUpiLink(text) {
  return extractUpiLinks(text)[0] ?? null;
}

/**
 * Validate a typed amount, honouring `mam` when the link carries one.
 * @param {string} value
 * @param {string | null} mam
 * @returns {{ valid: boolean, reason: string | null, amount: string | null }}
 */
export function validateAmount(value, mam) {
  const typed = String(value ?? "")
    .trim()
    .replace(/,/g, "");

  if (!typed) return { valid: false, reason: "Enter an amount.", amount: null };
  if (!/^\d+(\.\d{1,2})?$/.test(typed)) {
    return { valid: false, reason: "Use numbers with up to 2 decimals.", amount: null };
  }

  const number = Number(typed);
  if (!Number.isFinite(number) || number <= 0) {
    return { valid: false, reason: "Amount must be more than zero.", amount: null };
  }

  const min = minAmount(mam);
  if (min != null && number < min) {
    return {
      valid: false,
      reason: `Minimum amount is ₹${min}.`,
      amount: null,
    };
  }

  return { valid: true, reason: null, amount: String(number) };
}

/**
 * Build the SMS body. The prefix lets the receiver app recognise the request.
 * @param {string} link
 * @param {string} amount
 */
export function buildRequestText(link, amount) {
  const value = String(amount ?? "").trim();
  return `:txt ${value ? `Pay Rs ${value}` : "Pay"} ${link}`.trim();
}

/**
 * Encode a UPI link for an Expo Router param.
 *
 * Expo Router decodes route params twice. A normal percent-encoded query
 * therefore turns `%20` into a raw space, and the receiver's link scanner then
 * stops at that space. Base64url has no `%`, `&` or spaces, so the link
 * survives the trip intact.
 * @param {string} link
 */
export function encodeLinkParam(link) {
  const text = String(link ?? "");
  return encodeBase64(utf8Bytes(text))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Decode a value produced by {@link encodeLinkParam}. Raw legacy links and
 * single-encoded links are accepted too.
 * @param {unknown} value
 */
export function decodeLinkParam(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (UPI_PREFIX.test(text)) return text;

  if (/^upi%3a/i.test(text)) {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  const decoded = utf8Text(
    decodeBase64(text.replace(/-/g, "+").replace(/_/g, "/")),
  );
  return UPI_PREFIX.test(decoded) ? decoded : text;
}
