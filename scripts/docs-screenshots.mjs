import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer, preview } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(repoRoot, "docs/product-docs-workflow/screenshot-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const outputDir = resolve(repoRoot, manifest.defaults.outputDirectory);
const port = Number(process.env.EXPANDSO_DOCS_SCREENSHOT_PORT || 4175);
const baseUrl = `http://127.0.0.1:${port}`;
const shouldBuildFirst = process.argv.includes("--fresh-build");

process.env.VITE_EXPANDSO_DOCS_SCREENSHOTS = "1";
process.env.VITE_EXPANDSO_E2E = "0";

function runFreshBuild() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "build:frontend"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_EXPANDSO_DOCS_SCREENSHOTS: "1",
      VITE_EXPANDSO_E2E: "0",
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `Documentation screenshot build failed with status ${result.status ?? "unknown"}`,
    );
  }
}

function locatorFor(page, selector) {
  if (selector.startsWith("text:")) {
    return page.getByText(selector.slice("text:".length), { exact: true });
  }

  if (selector.startsWith("textIncludes:")) {
    return page.getByText(selector.slice("textIncludes:".length));
  }

  if (selector.startsWith("testid:")) {
    return page.getByTestId(selector.slice("testid:".length));
  }

  if (selector.startsWith("title:")) {
    return page.locator(`[title="${selector.slice("title:".length)}"]`);
  }

  if (selector.startsWith("placeholder:")) {
    return page.getByPlaceholder(selector.slice("placeholder:".length));
  }

  return page.locator(selector);
}

async function waitForWorkspace(page) {
  await page.getByTestId("app-workspace").waitFor({ state: "visible", timeout: 20000 });
  await page.getByText("Collection", { exact: true }).first().waitFor({ state: "visible" });
  await page.getByTestId("espanso-config-file").first().waitFor({ state: "visible" });
}

async function selectFile(page, relativePath) {
  const file = page.locator(
    `[data-testid="espanso-config-file"][data-config-relative-path="${relativePath}"]`,
  );
  await file.waitFor({ state: "visible", timeout: 20000 });
  await file.click();
  await page.getByTestId("config-detail").waitFor({ state: "visible" });
}

async function clickSnippet(page, trigger) {
  const row = page.locator(
    `[data-testid="snippet-row"][data-snippet-trigger="${trigger}"]`,
  );
  await row.waitFor({ state: "visible", timeout: 20000 });
  await row.click();
}

async function runStep(page, step) {
  if (step.action === "selectFile") {
    await selectFile(page, step.target);
    return;
  }

  if (step.action === "clickSnippet") {
    await clickSnippet(page, step.trigger);
    return;
  }

  const locator = locatorFor(page, step.selector);

  if (step.action === "click") {
    await locator.first().waitFor({ state: "visible", timeout: 20000 });
    await locator.first().click();
    return;
  }

  if (step.action === "setValue") {
    await locator.first().waitFor({ state: "visible", timeout: 20000 });
    await locator.first().fill(step.value);
    return;
  }

  await locator.first().waitFor({ state: "visible", timeout: 20000 });
}

async function startScreenshotServer() {
  if (shouldBuildFirst) {
    runFreshBuild();
    return await preview({
      configFile: resolve(repoRoot, "vite.config.ts"),
      root: repoRoot,
      preview: {
        host: "127.0.0.1",
        port,
        strictPort: true,
      },
    });
  }

  const server = await createServer({
    configFile: resolve(repoRoot, "vite.config.ts"),
    root: repoRoot,
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
    },
  });

  await server.listen();
  return server;
}

async function closeScreenshotServer(server) {
  if ("close" in server) {
    await server.close();
    return;
  }

  await new Promise((resolveClose, rejectClose) => {
    server.httpServer.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  for (const item of manifest.screenshots) {
    rmSync(resolve(outputDir, item.output), { force: true });
  }

  const server = await startScreenshotServer();

  const browser = await chromium.launch();
  try {
    for (const item of manifest.screenshots) {
      console.log(`Capturing ${item.id} -> ${item.output}`);
      const context = await browser.newContext({
        viewport: manifest.defaults.viewport,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      try {
        await page.goto(`${baseUrl}/?fixture=${encodeURIComponent(item.fixture)}&shot=${item.id}`, {
          waitUntil: "networkidle",
        });
        await waitForWorkspace(page);

        for (const step of item.steps) {
          await runStep(page, step);
        }

        await page.waitForTimeout(350);
        await page.screenshot({
          path: resolve(outputDir, item.output),
          fullPage: false,
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await closeScreenshotServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
