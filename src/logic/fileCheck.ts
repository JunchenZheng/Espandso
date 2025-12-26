import { isImageFilePath } from "./snippetUtils";

/**
 * Pure browser-safe binary data check (based on BOMs, null bytes, PDF header, and UTF-8 control character ratio).
 * Zero Node.js 'fs' / 'util' dependencies, 100% compatible with Vite browser bundle and Tauri webview.
 */
export function isBinaryData(data: Uint8Array | ArrayBuffer): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const len = bytes.length;
  if (len === 0) return false;

  // 1. Check common UTF BOMs (BOMs indicate text files)
  // UTF-8 BOM
  if (len >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return false;
  }
  // UTF-16 BE / LE BOM
  if (
    len >= 2 &&
    ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0xff && bytes[1] === 0xfe))
  ) {
    return false;
  }
  // UTF-32 BE / LE BOM
  if (
    len >= 4 &&
    ((bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xfe && bytes[3] === 0xff) ||
      (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0x00 && bytes[3] === 0x00))
  ) {
    return false;
  }

  // 2. Check PDF signature (%PDF-)
  if (
    len >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  ) {
    return true;
  }

  // 3. Scan up to 512 bytes for null byte and invalid control characters
  const maxScan = Math.min(len, 512);
  let suspiciousBytes = 0;

  for (let i = 0; i < maxScan; i++) {
    const b = bytes[i];

    // Null byte -> definitely binary
    if (b === 0) {
      return true;
    }

    // Control character checks (ASCII < 7 or 14..31 or 127)
    if (b < 7 || (b > 14 && b < 32) || b === 127) {
      // Check multi-byte UTF-8 sequences
      if (b >= 0xc0 && b <= 0xdf && i + 1 < maxScan) {
        if (bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xbf) {
          i++;
          continue;
        }
      } else if (b >= 0xe0 && b <= 0xef && i + 2 < maxScan) {
        if (
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf
        ) {
          i += 2;
          continue;
        }
      } else if (b >= 0xf0 && b <= 0xf7 && i + 3 < maxScan) {
        if (
          bytes[i + 1] >= 0x80 &&
          bytes[i + 1] <= 0xbf &&
          bytes[i + 2] >= 0x80 &&
          bytes[i + 2] <= 0xbf &&
          bytes[i + 3] >= 0x80 &&
          bytes[i + 3] <= 0xbf
        ) {
          i += 3;
          continue;
        }
      }

      suspiciousBytes++;
      if (i >= 32 && (suspiciousBytes * 100) / maxScan > 10) {
        return true;
      }
    }
  }

  return (suspiciousBytes * 100) / maxScan > 10;
}

/**
 * Checks if an HTML File object (from browser drag & drop) is binary.
 */
export async function isBinaryDomFile(file: File): Promise<boolean> {
  if (isImageFilePath(file.name)) {
    return true;
  }
  try {
    const arrayBuffer = await file.slice(0, 512).arrayBuffer();
    return isBinaryData(new Uint8Array(arrayBuffer));
  } catch {
    return false;
  }
}

/**
 * Checks if a file path points to a binary file using an optional readBytes function.
 */
export async function checkIsBinaryFilePath(
  filePath: string,
  readFileBytes?: (path: string) => Promise<Uint8Array>,
): Promise<boolean> {
  if (!filePath) return false;

  // Quick check by common image / binary extension
  if (isImageFilePath(filePath)) {
    return true;
  }

  if (readFileBytes) {
    try {
      const bytes = await readFileBytes(filePath);
      const sample = bytes.subarray(0, 512);
      return isBinaryData(sample);
    } catch {
      // If file reading fails or is restricted, fallback to extension check or false
      return false;
    }
  }

  return false;
}
