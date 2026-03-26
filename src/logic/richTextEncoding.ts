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

export function encodeRichTextUnicodeEntities(value: string): string {
  return decodeRichTextUnicodeEntities(value).replace(/[^\x00-\x7F]/g, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === undefined ? character : `&#x${codePoint.toString(16).toUpperCase()};`;
  });
}
