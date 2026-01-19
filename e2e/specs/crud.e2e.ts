import { $, expect } from "@wdio/globals";
import { strict as assert } from "node:assert";
import { readBaseYaml } from "../helpers/fixture";

async function byText(text: string) {
  return $(`//*[normalize-space()="${text}"]`);
}

async function snippetRow(trigger: string) {
  return $(`//*[@data-testid="snippet-row" and @data-snippet-trigger="${trigger}"]`);
}

async function expectSnippetRowDisplayed(trigger: string) {
  const row = await snippetRow(trigger);
  await row.waitForDisplayed({ timeout: 20000 });
  return row;
}

async function waitForYaml(predicate: (yaml: string) => boolean, timeoutMsg: string) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    if (predicate(readBaseYaml())) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(timeoutMsg);
}

describe("Expandso CRUD E2E", () => {
  it("shows snippets, adds a snippet, and batch deletes selected snippets", async () => {
    await expect(await byText("Collection")).toBeDisplayed();
    await expect(await byText("base")).toBeDisplayed();
    await expectSnippetRowDisplayed(":hello");
    await expectSnippetRowDisplayed(":bye");

    await (await byText("Add Snippet")).click();
    await expect(await byText("Add Text Snippet")).toBeDisplayed();
    await (await $("#trigger-0")).setValue(":e2e-added");
    await (await $("#replace")).setValue("Added by the E2E suite");
    await (await $("#description")).setValue("E2E added snippet");
    await (await byText("Save to YAML")).click();

    await waitForYaml(
      (yaml) => yaml.includes("trigger: :e2e-added"),
      "Expected added snippet to be written to YAML",
    );
    await expectSnippetRowDisplayed(":e2e-added");
    assert.match(readBaseYaml(), /replace: Added by the E2E suite/);

    await (await byText("Batch Delete")).click();
    await (await expectSnippetRowDisplayed(":hello")).click();
    await (await expectSnippetRowDisplayed(":bye")).click();
    await (await byText("Delete Selected (2)")).click();
    await expect(await byText("Batch Delete Snippets")).toBeDisplayed();
    await (await byText("Delete Selected")).click();

    await waitForYaml(
      (yaml) => !yaml.includes("trigger: :hello") && !yaml.includes("trigger: :bye"),
      "Expected selected snippets to be removed from YAML",
    );

    const yaml = readBaseYaml();
    assert.doesNotMatch(yaml, /trigger: :hello/);
    assert.doesNotMatch(yaml, /trigger: :bye/);
    assert.match(yaml, /trigger: :e2e-added/);
  });
});
