import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importYamlContent } from "./importYaml";

const currentDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(currentDir, "../../test_data/yaml/search-index-shapes.yml");

describe("importYaml shared fixtures", () => {
  it("imports supported snippet shapes from the shared search-index fixture", () => {
    const yaml = readFileSync(fixturePath, "utf8");
    const result = importYamlContent(yaml, "search-index-shapes.yml");

    expect(result.warnings).toEqual([]);
    expect(result.snippets).toHaveLength(7);
    expect(result.snippets.map((snippet) => snippet.trigger)).toEqual([
      ":hello",
      ":date",
      ":today",
      ":file",
      ":image",
      ":form",
      ":verbose",
    ]);
    expect(result.snippets[3]).toMatchObject({
      trigger: ":file",
      include_file: "customer_data.json",
      description: "External data",
    });
    expect(result.snippets[4]).toMatchObject({
      trigger: ":image",
      image_path: "/tmp/logo.png",
    });
    expect(result.snippets[5]).toMatchObject({
      trigger: ":form",
      form: "Name: [[name]]",
      form_fields: {
        name: {
          multiline: true,
        },
      },
    });
    expect(result.snippets[6]).toMatchObject({
      trigger: ":verbose",
      form: "Date: [[date]]",
      vars: [
        {
          name: "date",
          type: "date",
          params: {
            format: "%Y-%m-%d",
          },
        },
      ],
    });
  });
});
