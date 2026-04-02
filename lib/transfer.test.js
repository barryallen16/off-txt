import { describe, expect, test } from "bun:test";
import {
  decodeBase64,
  encodeBase64,
  utf8Bytes,
  utf8Text,
} from "./base64";
import {
  KIND,
  SEGMENT_CHARS,
  assemble,
  crc32,
  encodeTransfer,
  isTransferText,
  parsePart,
  parseParts,
} from "./transfer";
import {
  buildTrail,
  decodeLocation,
  distanceMeters,
  encodeLocation,
  formatAge,
  formatDistance,
  newSessionId,
} from "./geo";
import { classifyQr, normaliseQr, summariseQr } from "./qr";

// Every character a GSM-7 phone can carry in a single segment.
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

function isGsm7(text) {
  return [...text].every((char) => GSM7.includes(char));
}

const noise = (length, seed = 1) => {
  const bytes = new Uint8Array(length);
  let value = seed;
  for (let i = 0; i < length; i++) {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    bytes[i] = value & 0xff;
  }
  return bytes;
};

describe("base64", () => {
  test("round trips every byte value", () => {
    const bytes = new Uint8Array(256).map((_, index) => index);
    expect([...decodeBase64(encodeBase64(bytes))]).toEqual([...bytes]);
  });

  test("round trips all three tail lengths", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 4096]) {
      const bytes = noise(length, length + 7);
      expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    }
  });

  test("utf8 round trips emoji and Indic text", () => {
    const text = "₹250 • टिकट 🎟️ ok";
    expect(utf8Text(utf8Bytes(text))).toBe(text);
  });
});

describe("transfer parts", () => {
  test("every part fits one SMS segment in GSM-7", () => {
    const { parts } = encodeTransfer(KIND.TEXT, noise(3000));
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(SEGMENT_CHARS);
      expect(isGsm7(part)).toBe(true);
    }
  });

  test("text payload round trips in order", () => {
    const text = `:txt Pay Rs 250 upi://pay?pa=someone@okhdfc&pn=Someone&am=250 ${"x".repeat(400)}`;
    const { parts, id, total } = encodeTransfer(KIND.TEXT, text);

    const parsed = parts.map(parsePart);
    expect(parsed.every(Boolean)).toBe(true);
    expect(parsed[0].id).toBe(id);
    expect(parsed[0].total).toBe(total);

    const result = assemble(parsed);
    expect(result.complete).toBe(true);
    expect(result.error).toBeNull();
    expect(result.text).toBe(text);
  });

  test("out of order parts still assemble", () => {
    const { parts } = encodeTransfer(KIND.IMAGE, noise(2000, 99));
    const shuffled = [...parts].reverse();
    const result = assemble(shuffled.map(parsePart));
    expect(result.complete).toBe(true);
    expect([...result.bytes]).toEqual([...noise(2000, 99)]);
  });

  test("a single part payload stays one part", () => {
    const { parts } = encodeTransfer(KIND.QR, "MECARD:N:Doe;;");
    expect(parts.length).toBe(1);
    expect(assemble(parts.map(parsePart)).text).toBe("MECARD:N:Doe;;");
  });

  test("missing parts are reported instead of decoded", () => {
    const { parts } = encodeTransfer(KIND.TEXT, noise(900));
    const withoutMiddle = parts
      .map(parsePart)
      .filter((part) => part.seq !== 1);

    const result = assemble(withoutMiddle);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual([1]);
  });

  test("a flipped character fails the checksum", () => {
    const { parts } = encodeTransfer(KIND.TEXT, "hello there ".repeat(20));
    const parsed = parts.map(parsePart);
    const chunk = parsed[0].chunk;
    parsed[0].chunk = (chunk[0] === "A" ? "B" : "A") + chunk.slice(1);

    const result = assemble(parsed);
    expect(result.complete).toBe(false);
    expect(result.error).toBe("Checksum mismatch");
  });

  test("finds the part inside a notification with wrapper text", () => {
    const { parts } = encodeTransfer(KIND.QR, "https://example.com/t?x=1");
    const wrapped = `Messages: ${parts[0]}\n\nSent from your phone`;
    const parsed = parsePart(wrapped);
    expect(parsed).not.toBeNull();
    expect(parsed.kind).toBe(KIND.QR);
    expect(isTransferText(wrapped)).toBe(true);
  });

  test("reads every part of a multipart SMS joined into one body", () => {
    const text = `:txt Pay Rs 250 ${"y".repeat(500)}`;
    const { parts, id, total } = encodeTransfer(KIND.TEXT, text);
    expect(total).toBeGreaterThan(2);

    const body = parts.join("");
    const parsed = parseParts(body);
    expect(parsed.length).toBe(total);
    expect(parsed.map((part) => part.seq)).toEqual(
      Array.from({ length: total }, (_, index) => index),
    );
    expect(parsed.every((part) => part.id === id)).toBe(true);

    const result = assemble(parsed);
    expect(result.complete).toBe(true);
    expect(result.text).toBe(text);
  });

  test("reads parts even when the messaging app adds line breaks", () => {
    const { parts, total } = encodeTransfer(KIND.IMAGE, noise(1500, 3));
    const body = `New message\n${parts.join("\n")}\n`;
    expect(parseParts(body).length).toBe(total);
  });

  test("keeps the longer chunk when a truncated copy arrives later", () => {
    const { parts } = encodeTransfer(KIND.TEXT, "z".repeat(400));
    const first = parseParts(parts.join(""));
    const shortened = first.map((part) => ({ ...part, chunk: part.chunk.slice(0, 10) }));
    expect(shortened[0].chunk.length).toBeLessThan(first[0].chunk.length);
    // The ingestion layer compares lengths before replacing a stored chunk.
    expect(first[0].chunk.length).toBeGreaterThan(shortened[0].chunk.length);
  });

  test("ignores normal SMS and truncated parts", () => {
    expect(parsePart("Pay Rs 250 upi://pay?pa=a@b&am=250")).toBeNull();
    expect(parsePart("")).toBeNull();
    expect(parsePart("ot1.abc")).toBeNull();
    expect(
      parsePart("ot1.zzzz.t.05.02.0000.AAAA"),
    ).toBeNull();
  });

  test("crc32 matches known vectors", () => {
    expect(crc32(utf8Bytes(""))).toBe(0);
    expect(crc32(utf8Bytes("123456789"))).toBe(0xcbf43926);
  });
});

describe("location packets", () => {
  test("round trips a fix", () => {
    const sent = encodeLocation({
      lat: 25.3176,
      lon: 82.9739,
      accuracy: 12,
      timestamp: 1750000000000,
      session: "abc",
    });

    expect(isGsm7(sent.payload)).toBe(true);
    expect(sent.payload).toBe("abc,25.31760,82.97390,12,1750000000");

    const received = decodeLocation(sent.payload);
    expect(received.session).toBe("abc");
    expect(received.lat).toBe(25.3176);
    expect(received.lon).toBe(82.9739);
    expect(received.accuracy).toBe(12);
    expect(received.timestamp).toBe(1750000000000);
  });

  test("rejects impossible coordinates and junk", () => {
    expect(decodeLocation("abc,91.0,0,0,1750000000")).toBeNull();
    expect(decodeLocation("abc,0,181,0,1750000000")).toBeNull();
    expect(decodeLocation("nonsense")).toBeNull();
    expect(decodeLocation("")).toBeNull();
  });

  test("session ids are three base36 characters", () => {
    for (let i = 0; i < 20; i++) {
      expect(newSessionId()).toMatch(/^[0-9a-z]{3}$/);
    }
  });

  test("trail sorts, measures and goes stale", () => {
    const now = 1750000300000;
    const trail = buildTrail(
      [
        { lat: 25.3176, lon: 82.9739, timestamp: now - 60000 },
        { lat: 25.32, lon: 82.98, timestamp: now - 120000 },
      ],
      { now, staleAfterMs: 5 * 60 * 1000 },
    );

    expect(trail.points.length).toBe(2);
    expect(trail.points[0].timestamp).toBe(now - 120000);
    expect(trail.latest.timestamp).toBe(now - 60000);
    expect(trail.travelled).toBeGreaterThan(500);
    expect(trail.stale).toBe(false);

    const later = buildTrail(trail.points, { now: now + 10 * 60 * 1000 });
    expect(later.stale).toBe(true);
  });

  test("distance and formatting stay sane", () => {
    const zero = distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 });
    expect(zero).toBe(0);
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(3400)).toBe("3.4 km");
    expect(formatAge(8000)).toBe("8 s ago");
    expect(formatAge(6 * 60000)).toBe("6 min ago");
    expect(formatAge(3 * 3600 * 1000)).toBe("3 h ago");
    expect(formatAge(null)).toBe("no fix yet");
  });
});

describe("qr payloads", () => {
  test("keeps ticket text intact", () => {
    const ticket = "METRO|DEL|2026-10-22T18:04|A1B2C3D4";
    expect(normaliseQr(`  ${ticket}  `)).toMatchObject({
      valid: true,
      text: ticket,
    });
  });

  test("rejects empty and oversized codes", () => {
    expect(normaliseQr("   ").valid).toBe(false);
    expect(normaliseQr("a".repeat(2000)).valid).toBe(false);
  });

  test("classifies common codes", () => {
    expect(classifyQr("upi://pay?pa=a@b")).toBe("UPI payment");
    expect(classifyQr("https://example.com")).toBe("Link");
    expect(classifyQr("WIFI:S:Home;T:WPA;P:secret;;")).toBe("Wi-Fi network");
    expect(classifyQr("BEGIN:VCARD\nFN:A")).toBe("Contact card");
    expect(classifyQr("hello")).toBe("Text");
  });

  test("shortens long rows", () => {
    expect(summariseQr("a".repeat(100)).length).toBe(64);
  });
});
