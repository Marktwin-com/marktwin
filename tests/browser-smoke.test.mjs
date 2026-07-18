import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import puppeteer from "puppeteer";

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, child, logs) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Development server exited early.\n${logs.join("")}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Development server did not become ready.\n${logs.join("")}`);
}

async function waitForBodyText(page, expected, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const body = await page.evaluate(() => document.body.innerText);
    if (expected.every((value) => body.includes(value))) return body;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${expected.join(", ")}\n${await page.evaluate(() => document.body.innerText)}`);
}

async function waitForBodyMatch(page, pattern, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const body = await page.evaluate(() => document.body.innerText);
    if (pattern.test(body)) return body;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${pattern}:\n${await page.evaluate(() => document.body.innerText)}`);
}

function repositoryResponse() {
  return {
    name: "rules",
    full_name: "acme/rules",
    owner: { login: "acme" },
    default_branch: "main",
    private: true,
  };
}

test("agent workspace UI stages Markdown and preserves conflicts without legacy API calls", { timeout: 60_000 }, async () => {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const serverLogs = [];
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => serverLogs.push(String(chunk)));
  child.stderr.on("data", (chunk) => serverLogs.push(String(chunk)));

  let browser;
  const tempDirectory = await mkdtemp(join(tmpdir(), "marktwin-smoke-"));
  const importedFile = join(tempDirectory, "IMPORTED.md");
  await writeFile(importedFile, "# Imported\n", "utf8");

  try {
    await waitForServer(origin, child, serverLogs);
    assert.equal((await fetch(`${origin}/api/pdf/test`)).status, 404);
    assert.equal((await fetch(`${origin}/api/pdf/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown: "private" }) })).status, 404);
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const forbiddenApiCalls = [];
    const githubCalls = [];
    const pageErrors = [];
    let syncPrepared = false;
    let conflictBranch = "";

    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      const url = new URL(request.url());
      const method = request.method();
      if (url.origin === origin && /^\/api\/(?:vaults|notes|user\/preferences)/.test(url.pathname)) {
        forbiddenApiCalls.push(`${method} ${url.pathname}`);
      }
      if (url.origin !== "https://api.github.com") {
        await request.continue();
        return;
      }
      githubCalls.push(`${method} ${url.pathname}${url.search}`);

      const respond = (body, status = 200) => request.respond({
        status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-GitHub-Api-Version",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const path = url.pathname;
      if (method === "OPTIONS") return void await respond({}, 204);
      if (path === "/repos/acme/rules") return void await respond(repositoryResponse());
      if (path === "/repos/acme/rules/branches/main") {
        return void await respond({ name: "main", commit: { sha: "commit-1" } });
      }
      if (path.startsWith("/repos/acme/rules/git/ref/heads/")) {
        const sha = syncPrepared && path.endsWith("/main") ? "remote-commit" : path.endsWith("/main") ? "commit-1" : "commit-2";
        return void await respond({ object: { sha } });
      }
      if (method === "GET" && path.startsWith("/repos/acme/rules/git/commits/")) {
        return void await respond({ tree: { sha: path.endsWith("commit-1") ? "tree-1" : "tree-2" } });
      }
      if (method === "GET" && path === "/repos/acme/rules/git/trees/tree-1") {
        return void await respond({ sha: "tree-1", truncated: false, tree: [
          { path: ".agents", type: "tree", sha: "agents-tree-1" },
          { path: "docs", type: "tree", sha: "docs-tree" },
          { path: "README.md", type: "blob", sha: "readme-sha" },
          { path: "diagram.svg", type: "blob", sha: "svg-sha" },
        ] });
      }
      if (method === "GET" && path === "/repos/acme/rules/git/trees/tree-2") {
        return void await respond({ sha: "tree-2", truncated: false, tree: [
          { path: ".agents", type: "tree", sha: "agents-tree-2" },
          { path: "docs", type: "tree", sha: "docs-tree" },
          { path: "README.md", type: "blob", sha: "readme-sha" },
        ] });
      }
      if (method === "GET" && path.endsWith("/git/trees/agents-tree-1")) {
        return void await respond({ sha: "agents-tree-1", truncated: false, tree: [
          { path: "AGENTS.md", type: "blob", sha: "agents-sha" },
        ] });
      }
      if (method === "GET" && path.endsWith("/git/trees/agents-tree-2")) {
        return void await respond({ sha: "agents-tree-2", truncated: false, tree: [
          { path: "AGENTS.md", type: "blob", sha: "agents-sha" },
          { path: "IMPORTED.md", type: "blob", sha: "import-sha" },
          { path: "NEW.md", type: "blob", sha: "new-sha" },
        ] });
      }
      if (method === "GET" && path.startsWith("/repos/acme/rules/contents/")) {
        const name = decodeURIComponent(path.split("/").at(-1));
        const content = name === "AGENTS.md" ? "# Agent rules\n" : name === "IMPORTED.md" ? "# Imported\n" : "";
        return void await respond({
          name,
          path: `.agents/${name}`,
          sha: `${name.toLowerCase()}-sha`,
          encoding: "base64",
          content: Buffer.from(content).toString("base64"),
        });
      }
      if (method === "POST" && path.endsWith("/git/trees")) return void await respond({ sha: "tree-2" }, 201);
      if (method === "POST" && path.endsWith("/git/commits")) {
        syncPrepared = true;
        return void await respond({ sha: "commit-2" }, 201);
      }
      if (method === "PATCH" && path.includes("/git/refs/heads/main")) {
        return void await respond({ message: "Reference update failed" }, 422);
      }
      if (method === "POST" && path.endsWith("/git/refs")) {
        const body = JSON.parse(request.postData() || "{}");
        conflictBranch = String(body.ref || "").replace("refs/heads/", "");
        return void await respond({ ref: body.ref }, 201);
      }
      return void await respond({ message: `Unhandled smoke request: ${method} ${path}` }, 500);
    });

    await page.evaluateOnNewDocument(() => {
      localStorage.setItem("marktwin:saved-repos", JSON.stringify([{
        id: 101,
        displayName: "acme/rules",
        repoFullName: "acme/rules",
        defaultBranch: "main",
        createdAt: new Date().toISOString(),
      }]));
      sessionStorage.setItem("gh-token-101", "test-token");
    });
    await page.goto(`${origin}/cabinet/101`, { waitUntil: "domcontentloaded" });
    try {
      await waitForBodyText(page, ["AGENTS.md", "Folders (1)"], 15_000);
    } catch (error) {
      const body = await page.evaluate(() => document.body.innerText);
      throw new Error(`${error.message}\nBody:\n${body}\nGitHub calls:\n${githubCalls.join("\n")}\nPage errors:\n${pageErrors.join("\n")}`);
    }
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("README.md"), false);

    const folderButtons = await page.$$("button");
    let folderTrigger;
    for (const button of folderButtons) {
      if ((await button.evaluate((element) => element.textContent || "")).includes("Folders (1)")) {
        folderTrigger = button;
        break;
      }
    }
    assert.ok(folderTrigger, "Folder selector was not found.");
    await folderTrigger.click();
    await waitForBodyText(page, ["Main path", "docs"], 10_000);
    await page.keyboard.press("Escape");

    await page.$eval('button[title^="New Markdown"]', (button) => button.click());
    await page.waitForSelector('input[placeholder="Enter file name..."]');
    await page.type('input[placeholder="Enter file name..."]', "NEW.md");
    await page.keyboard.press("Enter");
    await waitForBodyText(page, ["NEW.md"]);

    const fileChooserPromise = page.waitForFileChooser();
    await page.click('button[title^="Import Markdown"]');
    const fileChooser = await fileChooserPromise;
    await fileChooser.accept([importedFile]);
    await waitForBodyText(page, ["IMPORTED.md"]);

    await page.click('button[title="Review staged changes"]');
    await waitForBodyText(page, ["Review changes before publishing"]);
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => /^Sync \d+ changes?$/.test(candidate.textContent?.trim() || ""));
      if (!(button instanceof HTMLButtonElement)) throw new Error("Final Sync button not found");
      button.click();
    });
    await waitForBodyText(page, ["Conflict detected"]);
    assert.match(conflictBranch, /^main-marktwin-\d{8}-\d{6}$/);
    assert.equal((await page.evaluate(() => document.body.innerText)).includes(conflictBranch), true);
    await page.$eval('button[aria-label="Dismiss notification"]', (button) => button.click());

    const shareButtonState = await page.$eval('button[aria-label="Start sharing session"]', (button) => ({ disabled: button.disabled, html: button.outerHTML }));
    assert.equal(shareButtonState.disabled, false, shareButtonState.html);
    await page.$eval('button[aria-label="Start sharing session"]', (button) => button.click());
    await page.waitForFunction(() => document.querySelector('#share-Edit-link') || document.body.innerText.includes("Failed to start sharing"), { timeout: 4_000 });
    if (await page.evaluate(() => document.body.innerText.includes("Failed to start sharing"))) {
      throw new Error(await page.evaluate(() => document.body.innerText));
    }
    try {
      await page.waitForFunction(() => document.querySelector('#share-Edit-link')?.value.includes('/join#'), { timeout: 8_000 });
    } catch (error) {
      const body = await page.evaluate(() => document.body.innerText);
      throw new Error(`${error.message}\nBody after Share:\n${body}\nPage errors:\n${pageErrors.join("\n")}`);
    }
    const initialLinks = await page.evaluate(() => ({
      edit: document.querySelector('#share-Edit-link')?.value || "",
      view: document.querySelector('#share-View-only-link')?.value || "",
    }));
    assert.notEqual(initialLinks.edit, initialLinks.view);
    await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const close = dialogs.flatMap((dialog) => Array.from(dialog.querySelectorAll("button"))).reverse().find((button) => button.textContent?.trim() === "Close");
      if (close instanceof HTMLButtonElement) close.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const editPage = await browser.newPage();
    const viewPage = await browser.newPage();
    editPage.setDefaultTimeout(10_000);
    viewPage.setDefaultTimeout(10_000);
    editPage.on("pageerror", (error) => pageErrors.push(`edit: ${error.message}`));
    viewPage.on("pageerror", (error) => pageErrors.push(`view: ${error.message}`));
    editPage.on("console", (message) => { if (["error", "warning"].includes(message.type())) pageErrors.push(`edit ${message.type()}: ${message.text()}`); });
    viewPage.on("console", (message) => { if (["error", "warning"].includes(message.type())) pageErrors.push(`view ${message.type()}: ${message.text()}`); });
    await Promise.all([
      editPage.goto(initialLinks.edit, { waitUntil: "domcontentloaded" }),
      viewPage.goto(initialLinks.view, { waitUntil: "domcontentloaded" }),
    ]);
    try {
      await Promise.all([
        waitForBodyText(editPage, ["Connected with edit access", "AGENTS.md"], 25_000),
        waitForBodyText(viewPage, ["Connected view-only", "AGENTS.md"], 25_000),
      ]);
    } catch (error) {
      const [editBody, viewBody, ownerBody] = await Promise.all([editPage.evaluate(() => document.body.innerText), viewPage.evaluate(() => document.body.innerText), page.evaluate(() => document.body.innerText)]);
      throw new Error(`${error.message}\nEdit:\n${editBody}\nView:\n${viewBody}\nOwner:\n${ownerBody}\nErrors:\n${pageErrors.join("\n")}\nServer:\n${serverLogs.join("")}`);
    }
    assert.equal(await viewPage.$('button[title="Review staged changes"]'), null);
    assert.equal(await viewPage.$('button[title^="New Markdown"]'), null);
    assert.equal(await viewPage.$('button[title^="Import Markdown"]'), null);
    assert.equal(await viewPage.$eval(".cm-content", (element) => element.getAttribute("contenteditable")), "false");

    await editPage.$eval('[aria-label="Open AGENTS.md"]', (element) => element.click());
    await editPage.focus(".cm-content");
    await editPage.keyboard.press("End");
    await editPage.keyboard.type("\npeer edit");
    await page.$eval('[aria-label="Open AGENTS.md"]', (element) => element.click());
    await waitForBodyText(page, ["peer edit"], 10_000);

    await viewPage.$eval('button[aria-label="Toggle discussion"]', (button) => button.click());
    await viewPage.waitForSelector('input[aria-label="Discussion message"]');
    await viewPage.focus('input[aria-label="Discussion message"]');
    await viewPage.keyboard.type("view peer can discuss");
    await viewPage.$eval('button[aria-label="Send discussion message"]', (button) => button.click());
    await page.$eval('button[aria-label="Toggle discussion"]', (button) => button.click());
    await waitForBodyText(page, ["view peer can discuss"], 10_000);
    await page.$eval('button[aria-label="Close discussion"]', (button) => button.click());
    await new Promise((resolve) => setTimeout(resolve, 250));

    await page.$eval('button[aria-label="Open sharing session details"]', (button) => button.click());
    await page.waitForSelector('#share-Edit-link');
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Rotate links"));
      if (!(button instanceof HTMLButtonElement)) throw new Error("Rotate links button not found");
      button.click();
    });
    {
      const deadline = Date.now() + 10_000;
      while (await page.evaluate(() => document.querySelector('#share-Edit-link')?.value || "") === initialLinks.edit || !(await page.$('#share-Edit-link'))) {
        if (Date.now() > deadline) throw new Error("Rotated edit link did not change.");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await Promise.all([
      waitForBodyMatch(editPage, /Owner session ended|Connection lost/, 10_000),
      waitForBodyMatch(viewPage, /Owner session ended|Connection lost/, 10_000),
    ]);
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Stop session"));
      if (button instanceof HTMLButtonElement) button.click();
    });
    await editPage.close();
    await viewPage.close();

    const unnamedButtons = await page.evaluate(() => Array.from(document.querySelectorAll("button")).filter((button) => {
      const name = button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent?.trim();
      return !name;
    }).map((button) => button.outerHTML));
    assert.deepEqual(unnamedButtons, []);
    await page.screenshot({ path: "/private/tmp/marktwin-workspace-attuned.png", fullPage: true });

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await waitForBodyText(page, ["Document", "Discussion"], 5_000);
    const mobileLayout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      mainWidth: document.querySelector("main")?.getBoundingClientRect().width || 0,
    }));
    assert.equal(mobileLayout.scrollWidth <= mobileLayout.viewport, true);
    assert.equal(mobileLayout.mainWidth >= 360, true);
    await page.screenshot({ path: "/private/tmp/marktwin-workspace-mobile-attuned.png", fullPage: true });

    for (const width of [768, 1024, 1440]) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      const responsiveLayout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        mainWidth: document.querySelector("main")?.getBoundingClientRect().width || 0,
      }));
      assert.equal(responsiveLayout.scrollWidth <= responsiveLayout.viewport, true, `workspace overflows at ${width}px`);
      assert.equal(responsiveLayout.mainWidth >= 360, true, `workspace document is too narrow at ${width}px: ${responsiveLayout.mainWidth}px`);
    }
    await page.screenshot({ path: "/private/tmp/marktwin-workspace-desktop-attuned.png", fullPage: true });

    const homePage = await browser.newPage();
    await homePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    try {
      await homePage.goto(origin, { waitUntil: "domcontentloaded" });
    } catch (error) {
      throw new Error(`${error.message}\nServer exit: ${child.exitCode}, signal: ${child.signalCode}\n${serverLogs.join("")}`);
    }
    const homeLayout = await homePage.evaluate(() => ({ viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.equal(homeLayout.scrollWidth <= homeLayout.viewport, true);
    await homePage.screenshot({ path: "/private/tmp/marktwin-home-mobile-attuned.png", fullPage: true });
    await homePage.close();

    assert.deepEqual(forbiddenApiCalls, []);
    assert.deepEqual(pageErrors, []);
  } finally {
    if (browser) {
      let closed = false;
      await Promise.race([
        browser.close().then(() => { closed = true; }),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
      if (!closed) browser.process()?.kill("SIGKILL");
    }
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 2_000).unref();
    });
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
