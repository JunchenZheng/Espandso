import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseAlfredInfoPlist, parseAlfredSnippetsZip } from "./alfredImporter";

describe("parseAlfredInfoPlist", () => {
  it("parses snippetkeywordprefix and snippetkeywordsuffix from valid plist XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>snippetkeywordprefix</key>
	<string>:</string>
	<key>snippetkeywordsuffix</key>
	<string>!</string>
</dict>
</plist>`;

    const result = parseAlfredInfoPlist(xml);
    expect(result).toEqual({
      snippetkeywordprefix: ":",
      snippetkeywordsuffix: "!",
    });
  });

  it("handles unescaping XML entities and empty strings", () => {
    const xml = `<dict>
	<key>snippetkeywordprefix</key>
	<string>&amp;</string>
	<key>snippetkeywordsuffix</key>
	<string></string>
</dict>`;

    const result = parseAlfredInfoPlist(xml);
    expect(result).toEqual({
      snippetkeywordprefix: "&",
      snippetkeywordsuffix: "",
    });
  });
});

describe("parseAlfredSnippetsZip", () => {
  it("extracts valid alfredsnippets entries from a zip archive without info.plist", async () => {
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

  it("applies prefix and suffix from info.plist to snippet keywords", async () => {
    const zip = new JSZip();

    // info.plist with prefix ":" and suffix ""
    zip.file(
      "info.plist",
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>snippetkeywordprefix</key>
	<string>:</string>
	<key>snippetkeywordsuffix</key>
	<string></string>
</dict>
</plist>`,
    );

    zip.file(
      "snippet1.json",
      JSON.stringify({
        alfredsnippet: {
          snippet: "Alfred snippet content",
          keyword: "omg",
          name: "OMG",
          uid: "uid-omg",
        },
      }),
    );

    const zipBuffer = await zip.generateAsync({ type: "uint8array" });
    const results = await parseAlfredSnippetsZip(zipBuffer);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: "uid-omg",
      trigger: ":omg",
      replace: "Alfred snippet content",
      name: "OMG",
      jsonPath: "snippet1.json",
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
