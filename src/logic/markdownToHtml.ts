import { marked } from "marked";
import type { MarkedOptions } from "marked";
import { encodeNonAsciiToHtmlEntities } from "./richTextEncoding";

/**
 * Configure marked for inline rendering only – no wrapping `<p>` tags for
 * single-line input, preserving the compact output Espanso expects.
 */
const renderer = new marked.Renderer();

// Preserve line breaks as `<br>` but do not wrap in <p> paragraphs
renderer.paragraph = ({ tokens }) => {
  const body = marked.Parser.parseInline(tokens, { renderer });
  return `${body}\n`;
};

const markedOptions: MarkedOptions & { async: false } = {
  renderer,
  async: false,
  // Disable GFM extensions that could interfere with simple snippet content
  breaks: true,
};

/**
 * Render a Markdown string to HTML, then encode every non-ASCII character as
 * an HTML numeric entity (`&#xHEX;`).
 *
 * The resulting HTML is pure ASCII and safe for Espanso's `html:` field –
 * it avoids the clipboard encoding issue that causes CJK mojibake in
 * Espanso's `markdown:` mode.
 */
export function renderMarkdownToSafeHtml(markdownSource: string): string {
  const rawHtml = marked.parse(markdownSource, markedOptions).trim();
  return encodeNonAsciiToHtmlEntities(rawHtml);
}
