import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseAlfredSnippetsZip } from "./alfredImporter";

describe("parseAlfredSnippetsZip", () => {
  it("extracts valid alfredsnippets entries from a zip archive", async () => {
    const zip = new JSZip();

    // Valid snippet JSON inside a folder
    zip.file(
      "Folder/snippet1.json",
      JSON.stringify({
        alfredsnippet: {
          snippet: "Hello World",
          keyword: ":hello",
          name: "Greeting",
          uid: "uid-123",
        },
      }),
    );

    // Another valid snippet JSON directly under root
    zip.file(
      "snippet2.json",
      JSON.stringify({
        alfredsnippet: {
          snippet: "Email body",
          keyword: ":email",
          name: "Email Template",
        },
      }),
    );

    // Root info.json metadata (which shouldn't match snippet criteria)
    zip.file("info.json", JSON.stringify({ name: "My Collection", readme: "Demo" }));

    // macOS AppleDouble junk file that should be ignored
    zip.file("._snippet1.json", "junk binary content");

    const zipBuffer = await zip.generateAsync({ type: "uint8array" });
    const results = await parseAlfredSnippetsZip(zipBuffer);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "uid-123",
      trigger: ":hello",
      replace: "Hello World",
      name: "Greeting",
      jsonPath: "Folder/snippet1.json",
    });
    expect(results[1]).toMatchObject({
      trigger: ":email",
      replace: "Email body",
      name: "Email Template",
      jsonPath: "snippet2.json",
    });
  });

  it("handles empty zip or archive with no valid snippets gracefully", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "just plain text");
    const zipBuffer = await zip.generateAsync({ type: "uint8array" });

    const results = await parseAlfredSnippetsZip(zipBuffer);
    expect(results).toEqual([]);
  });

  it("ignores corrupted JSON entries inside the archive", async () => {
    const zip = new JSZip();
    zip.file("bad.json", "{ invalid json content");
    zip.file(
      "good.json",
      JSON.stringify({
        alfredsnippet: {
          snippet: "Valid",
          keyword: ":valid",
        },
      }),
    );
    const zipBuffer = await zip.generateAsync({ type: "uint8array" });

    const results = await parseAlfredSnippetsZip(zipBuffer);
    expect(results).toHaveLength(1);
    expect(results[0].trigger).toBe(":valid");
  });
});
