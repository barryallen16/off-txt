import { describe, expect, test } from "bun:test";
import { normalizeSender } from "./sender";
import {
  CHUNK_CHARS,
  KIND,
  SEGMENT_CHARS,
  assemble,
  encodeTransfer,
  formatCrc,
  parseParts,
} from "./transfer";
import { hasRequestTrigger, validateAmount } from "./upi";

describe("audit fixes", () => {
  test("the CRC keeps all 32 bits in seven base-36 characters", () => {
    const crc = 0xcbf43926;
    const formatted = formatCrc(crc);

    expect(formatted.length).toBe(7);
    expect(parseInt(formatted, 36)).toBe(crc);
    expect(formatCrc(0)).toBe("0000000");
  });

  test("a part still fits one GSM-7 segment after the wider CRC", () => {
    const { parts } = encodeTransfer(KIND.TEXT, "x".repeat(CHUNK_CHARS + 1));

    expect(parts.length).toBe(2);
    expect(parseParts(parts[0])[0].crc).toMatch(/^[0-9a-z]{7}$/);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(SEGMENT_CHARS);
    }
  });

  test("the :txt trigger ignores keyboard capitalisation", () => {
    const samples = [
      ":txt Pay Rs 100 upi://pay?pa=test@upi",
      ":Txt Pay Rs 100 upi://pay?pa=test@upi",
      ":TXT Pay Rs 100 upi://pay?pa=test@upi",
      "Notice :txt Pay Rs 100 upi://pay?pa=test@upi",
    ];

    for (const sample of samples) expect(hasRequestTrigger(sample)).toBe(true);
    expect(hasRequestTrigger("pay upi://pay?pa=test@upi")).toBe(false);
    expect(hasRequestTrigger(":texture pay")).toBe(false);
  });

  test("a corrupted part 0 header cannot poison the checksum", () => {
    const payload = "Secret Boarding Pass 123456789 ".repeat(12);
    const { parts } = encodeTransfer(KIND.QR, payload);
    expect(parts.length).toBeGreaterThan(1);

    const parsed = parts.map((part) => parseParts(part)[0]);
    const corrupted = [{ ...parsed[0], crc: "zzzzzzz" }, ...parsed.slice(1)];

    const result = assemble(corrupted);
    expect(result.complete).toBe(true);
    expect(result.text).toBe(payload);
  });

  test("a corrupted payload is still rejected", () => {
    const { parts } = encodeTransfer(KIND.TEXT, "ticket 123");
    const parsed = parts.map((part) => parseParts(part)[0]);
    parsed[0].chunk = (parsed[0].chunk[0] === "A" ? "B" : "A") + parsed[0].chunk.slice(1);

    expect(assemble(parsed).error).toBe("Checksum mismatch");
  });

  test("a single message from India is capped at one lakh rupees", () => {
    expect(validateAmount("100000", null).valid).toBe(true);
    expect(validateAmount("100000.00", null).valid).toBe(true);
    expect(validateAmount("100000.01", null).valid).toBe(false);
    expect(validateAmount("500000", null).valid).toBe(false);
  });

  test("sender names survive while phone numbers collapse to ten digits", () => {
    expect(normalizeSender("Barry")).toBe("Barry");
    expect(normalizeSender("+91 98765 43210")).toBe("9876543210");
    expect(normalizeSender("98765 43210")).toBe("9876543210");
    expect(normalizeSender("  ")).toBe(null);
  });
});
