// QR passthrough.
//
// A QR code is just text. Sending one means sending that text and rendering it
// again on the other side, so tickets, boarding passes and payment codes all
// work the same way, with no ticket-issuer integration.

export const MAX_QR_CHARS = 1500;

/**
 * Trim and sanity check scanned or pasted QR content.
 * @param {string} text
 * @returns {{ valid: boolean, text: string, reason: string | null, type: string }}
 */
export function normaliseQr(text) {
  const value = typeof text === "string" ? text.trim() : "";
  const type = classifyQr(value);

  if (!value) {
    return { valid: false, text: "", reason: "Nothing to send.", type };
  }
  if (value.length > MAX_QR_CHARS) {
    return {
      valid: false,
      text: value,
      reason: `Codes longer than ${MAX_QR_CHARS} characters are not supported.`,
      type,
    };
  }

  return { valid: true, text: value, reason: null, type };
}

/** Best effort label for the UI. */
export function classifyQr(text) {
  const value = String(text ?? "").trim();
  if (/^upi:\/\/pay\?/i.test(value)) return "UPI payment";
  if (/^https?:\/\//i.test(value)) return "Link";
  if (/^WIFI:/i.test(value)) return "Wi-Fi network";
  if (/^BEGIN:VCARD/i.test(value)) return "Contact card";
  if (/^MECARD:/i.test(value)) return "Contact card";
  if (/^tel:/i.test(value)) return "Phone number";
  if (/^\d{10,}$/.test(value)) return "Number";
  return "Text";
}

/**
 * One line for a list row.
 * @param {string} text
 */
export function summariseQr(text) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > 64 ? `${value.slice(0, 61)}...` : value;
}
