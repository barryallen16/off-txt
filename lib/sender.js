// One sender identity for the notification path, the inbox path and the UI.
//
// A messaging-app notification usually shows the contact name, while the SMS
// inbox only knows the raw address. Both paths run through this module so a
// location trail does not split into one trail per spelling.

/** True when the value looks like a dialable number rather than a name. */
export function isPhoneSender(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (!/^[+\d][\d\s().-]*$/.test(text)) return false;
  return text.replace(/\D/g, "").length >= 6;
}

/**
 * Keep digits only for real phone numbers, and compare the last ten digits so
 * +91 98765 43210 and 98765 43210 are the same sender. Names are left alone.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeSender(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!isPhoneSender(text)) return text;

  const cleaned = text.replace(/[^\d+]/g, "");
  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
}
