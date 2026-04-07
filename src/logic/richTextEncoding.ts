export function decodeRichTextUnicodeEntities(value: string): string {
  return value.replace(/&#(?:x([0-9a-fA-F]+)|(\d+));/g, (entity, hex, decimal) => {
    const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
    if (!Number.isFinite(codePoint)) return entity;

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

/** Returns true if the string contains any character outside the ASCII range. */
export function containsNonAscii(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(value);
}

/**
 * Encode every non-ASCII character in `value` as an HTML numeric character
 * reference (`&#xHEX;`).  The result is pure ASCII and safe for clipboard
 * HTML payloads that may lose encoding information.
 */
export function encodeNonAsciiToHtmlEntities(value: string): string {
  return value.replace(/[^\x00-\x7F]/gu, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === undefined ? character : `&#x${codePoint.toString(16).toUpperCase()};`;
  });
}
