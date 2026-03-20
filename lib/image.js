// Photo to SMS parts.
//
// The native compressor downsizes, converts to greyscale, posterises and saves
// a low quality JPEG, which is the same recipe that gets a 3 MB photo down to a
// few kilobytes. Without it (iOS, or a build missing the module) we fall back to
// resizing alone.

import { requireOptionalNativeModule } from "expo";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decodeBase64 } from "./base64";
import { KIND, encodeTransfer, partCount } from "./transfer";

const native = requireOptionalNativeModule("OffTxtSms");

/** Bytes of JPEG we aim for. 3 KB is about 24 SMS parts. */
export const TARGET_BYTES = 3200;

const LADDER = [
  { width: 560, quality: 30, levels: 8 },
  { width: 480, quality: 25, levels: 8 },
  { width: 420, quality: 20, levels: 6 },
  { width: 360, quality: 18, levels: 6 },
  { width: 320, quality: 15, levels: 5 },
  { width: 280, quality: 12, levels: 4 },
  { width: 240, quality: 10, levels: 4 },
];

const FALLBACK_LADDER = [
  { width: 640, compress: 0.4 },
  { width: 512, compress: 0.3 },
  { width: 420, compress: 0.2 },
  { width: 360, compress: 0.15 },
  { width: 300, compress: 0.1 },
  { width: 240, compress: 0.08 },
];

/**
 * @param {string} uri local file or content uri
 * @param {number} [target] bytes
 * @returns {Promise<{ base64: string, bytes: number, width: number, height: number, parts: number, compressed: boolean }>}
 */
export async function compressToTarget(uri, target = TARGET_BYTES) {
  if (native?.compressImage) {
    let last = null;

    for (const step of LADDER) {
      const result = await native.compressImage(
        uri,
        step.width,
        step.quality,
        step.levels,
      );
      const bytes = Number(result?.bytes) || 0;
      last = { ...result, bytes, step };

      if (bytes > 0 && bytes <= target) {
        return pack(result.base64, bytes, result.width, result.height, true);
      }
    }

    if (last?.base64) {
      return pack(last.base64, last.bytes, last.width, last.height, true);
    }
  }

  let last = null;
  for (const step of FALLBACK_LADDER) {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: step.width } }],
      { compress: step.compress, format: SaveFormat.JPEG, base64: true },
    );
    const bytes = base64Bytes(result.base64);
    last = { ...result, bytes };

    if (bytes <= target) {
      return pack(result.base64, bytes, result.width, result.height, false);
    }
  }

  return pack(last.base64, last.bytes, last.width, last.height, false);
}

function pack(base64, bytes, width, height, compressed) {
  return {
    base64,
    bytes: bytes || base64Bytes(base64),
    width: Number(width) || 0,
    height: Number(height) || 0,
    parts: partCount(decodeBase64(base64)),
    compressed,
  };
}

/** Byte length of a base64 string. */
export function base64Bytes(base64) {
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Split the compressed JPEG into SMS parts. */
export function buildImageTransfer(base64) {
  return encodeTransfer(KIND.IMAGE, decodeBase64(base64));
}

/** "3.1 KB" */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
