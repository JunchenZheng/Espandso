import { describe, it, expect } from "vitest";
import { renderMarkdownToSafeHtml } from "./markdownToHtml";

describe("renderMarkdownToSafeHtml", () => {
  it("renders bold markdown to HTML", () => {
    const result = renderMarkdownToSafeHtml("This **is** rich");
    expect(result).toContain("<strong>is</strong>");
    expect(result).toContain("This");
  });

  it("renders italic markdown to HTML", () => {
    const result = renderMarkdownToSafeHtml("This *is* italic");
    expect(result).toContain("<em>is</em>");
  });

  it("preserves ASCII characters as-is", () => {
    const result = renderMarkdownToSafeHtml("Hello **world**!");
    expect(result).not.toMatch(/&#x/);
    expect(result).toContain("Hello");
    expect(result).toContain("world");
  });

  it("encodes non-ASCII characters as HTML entities", () => {
    const result = renderMarkdownToSafeHtml("**中文** and English");
    // 中 = U+4E2D, 文 = U+6587
    expect(result).toContain("&#x4E2D;");
    expect(result).toContain("&#x6587;");
    expect(result).toContain("<strong>");
    expect(result).toContain("and English");
    // Should NOT contain raw Chinese characters
    expect(result).not.toContain("中");
    expect(result).not.toContain("文");
  });

  it("handles multi-line markdown with non-ASCII", () => {
    const result = renderMarkdownToSafeHtml("# 标题\n\n内容 **加粗**");
    // Should contain encoded characters
    expect(result).toContain("&#x");
    expect(result).toContain("<strong>");
    // Should NOT contain raw CJK
    expect(result).not.toContain("标");
    expect(result).not.toContain("内");
  });

  it("handles mixed ASCII and non-ASCII inline", () => {
    const result = renderMarkdownToSafeHtml("Hello 世界!");
    expect(result).toContain("Hello");
    expect(result).toContain("&#x4E16;"); // 世
    expect(result).toContain("&#x754C;"); // 界
    expect(result).toContain("!");
  });

  it("encodes non-BMP characters as a single HTML entity", () => {
    const result = renderMarkdownToSafeHtml("Ship it 😀");
    expect(result).toBe("Ship it &#x1F600;");
  });

  it("handles empty string", () => {
    const result = renderMarkdownToSafeHtml("");
    expect(result).toBe("");
  });

  it("handles plain ASCII-only string", () => {
    const result = renderMarkdownToSafeHtml("just text");
    expect(result).toBe("just text");
  });
});
