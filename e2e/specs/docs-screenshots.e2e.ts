import { $, browser, expect } from "@wdio/globals";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedDocsScreenshotFiles, type DocsFixtureScenario } from "../helpers/docsFixture";

interface ScreenshotManifest {
  defaults: {
    viewport: {
      width: number;
      height: number;
    };
    outputDirectory: string;
  };
  screenshots: ScreenshotItem[];
}

interface ScreenshotItem {
  id: string;
  title: string;
  fixture: DocsFixtureScenario;
  output: string;
  steps: ScreenshotStep[];
}

type ScreenshotStep =
  | { action: "selectFile"; target: string }
  | { action: "clickSnippet"; trigger: string }
  | { action: "click" | "waitForDisplayed"; selector: string }
  | { action: "setValue"; selector: string; value: string };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(repoRoot, "docs/product-docs-workflow/screenshot-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ScreenshotManifest;
const outputDir = resolve(repoRoot, manifest.defaults.outputDirectory);
const wdioBrowser = browser as unknown as {
  setWindowSize: (width: number, height: number) => Promise<void>;
  refresh: () => Promise<void>;
  pause: (ms: number) => Promise<void>;
  saveScreenshot: (path: string) => Promise<void>;
};

function xpathText(text: string) {
  return `//*[normalize-space()="${text}"]`;
}

function selectorFor(selector: string) {
  if (selector.startsWith("text:")) {
    return xpathText(selector.slice("text:".length));
  }

  if (selector.startsWith("testid:")) {
    return `[data-testid="${selector.slice("testid:".length)}"]`;
  }

  if (selector.startsWith("title:")) {
    return `[title="${selector.slice("title:".length)}"]`;
  }

  if (selector.startsWith("placeholder:")) {
    return `[placeholder="${selector.slice("placeholder:".length)}"]`;
  }

  return selector;
}

async function findRequired(selector: string) {
  const element = await $(selectorFor(selector));
  await element.waitForDisplayed({ timeout: 20000 });
  return element;
}

async function waitForWorkspace() {
  await findRequired("testid:app-workspace");
  await findRequired("text:Collection");
  await findRequired("testid:espanso-config-file");
}

async function resetApp(fixture: DocsFixtureScenario) {
  seedDocsScreenshotFiles(fixture);
  await wdioBrowser.setWindowSize(
    manifest.defaults.viewport.width,
    manifest.defaults.viewport.height,
  );
  await wdioBrowser.refresh();
  await waitForWorkspace();
}

async function selectFile(relativePath: string) {
  const file = await $(`[data-testid="espanso-config-file"][data-config-relative-path="${relativePath}"]`);
  await file.waitForDisplayed({ timeout: 20000 });
  await file.click();
  await findRequired("testid:config-detail");
}

async function clickSnippet(trigger: string) {
  const row = await $(`//*[@data-testid="snippet-row" and @data-snippet-trigger="${trigger}"]`);
  await row.waitForDisplayed({ timeout: 20000 });
  await row.click();
}

async function runStep(step: ScreenshotStep) {
  if (step.action === "selectFile") {
    await selectFile(step.target);
    return;
  }

  if (step.action === "clickSnippet") {
    await clickSnippet(step.trigger);
    return;
  }

  if (step.action === "click") {
    const element = await findRequired(step.selector);
    await element.click();
    return;
  }

  if (step.action === "setValue") {
    const element = await findRequired(step.selector);
    await element.setValue(step.value);
    return;
  }

  await findRequired(step.selector);
}

describe("Expandso documentation screenshots", () => {
  before(() => {
    mkdirSync(outputDir, { recursive: true });
  });

  for (const item of manifest.screenshots) {
    it(`captures ${item.id} - ${item.title}`, async () => {
      await resetApp(item.fixture);

      for (const step of item.steps) {
        await runStep(step);
      }

      await wdioBrowser.pause(350);
      const outputPath = resolve(outputDir, item.output);
      await wdioBrowser.saveScreenshot(outputPath);
      expect(existsSync(outputPath)).toBe(true);
    });
  }
});
