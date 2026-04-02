// UPI link parsing and rewriting.
//
// The link is handled as a raw string on purpose. UPI signatures cover every
// byte before `&sign=`, so nothing here may re-encode or reorder parameters.
// The only edits allowed are removing the `sign`/`am` pairs and appending `am`.

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
 * Add an amount to a UPI link.
 *
 * - An existing non-empty `am` is left untouched (and the signature stays valid).
 * - Otherwise the `sign` pair is dropped and `am` is appended as the last
 *   parameter. The intent becomes unsigned, so the PSP may ask the payer to
 *   verify it, but the amount is prefilled and still editable.
 * @param {string} raw
 * @param {string} amount
 * @returns {{ link: string, strippedSignature: boolean }}
 */
export function buildRequestLink(raw, amount) {
  const parsed = parseUpiLink(raw);
  const value = String(amount ?? "").trim();

  if (!parsed.valid) return { link: parsed.raw, strippedSignature: false };
  if (parsed.am != null) return { link: parsed.raw, strippedSignature: false };
  if (!value) return { link: parsed.raw, strippedSignature: false };

  const text = parsed.raw.trim();
  const prefix = text.match(UPI_PREFIX)[0];
  const pairs = splitPairs(text.slice(prefix.length)).filter(
    (pair) => pair.raw !== "",
  );
  const strippedSignature = pairs.some((pair) => pair.key === "sign");
  const kept = pairs
    .filter((pair) => pair.key !== "sign" && pair.key !== "am")
    .map((pair) => pair.raw);

  const link =
    prefix +
    (kept.length ? kept.join("&") + "&" : "") +
    "am=" +
    encodeURIComponent(value);

  return { link, strippedSignature };
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
  return `:txt Pay Rs ${String(amount ?? "").trim()} ${link}`.trim();
}
