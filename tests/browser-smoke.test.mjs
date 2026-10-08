import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import puppeteer from "puppeteer";
import { createGitHubFixture } from "./fixtures/github.mjs";

async function availablePort() {
  return new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); }); });
}
async function bodyIncludes(page, text, timeout = 20000) {
  try { await page.waitForFunction(text => document.body.innerText.includes(text), { timeout }, text); }
  catch (error) { throw new Error(`${error.message}\nExpected: ${text}\nBody: ${await page.evaluate(() => document.body.innerText)}`); }
}
async function clickText(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll('button,[role="menuitem"]')].some(node => node.textContent.trim() === text && node.getClientRects().length), {}, text);
  await page.evaluate(text => [...document.querySelectorAll('button,[role="menuitem"]')].find(node => node.textContent.trim() === text && node.getClientRects().length).click(), text);
}
async function sourceAppend(page, text) {
  await page.waitForSelector('.cm-content[contenteditable="true"]');
  await page.click('.cm-content[contenteditable="true"]');
  await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.press(process.platform === "darwin" ? "ArrowDown" : "End");
  await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.type(text);
}

test("account-free workspace: upgrade, formats, checkpoint, recovery, collaboration and privacy", { timeout: 180000 }, async () => {
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "development", PORT: String(port), DATABASE_URL: "" }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", chunk => logs.push(String(chunk))); child.stderr.on("data", chunk => logs.push(String(chunk)));
  let browser;
  const errors = []; const forbidden = []; const fixture = createGitHubFixture();
  try {
    for (let i = 0; i < 150; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (child.exitCode !== null) throw new Error(logs.join("")); await new Promise(resolve => setTimeout(resolve, 100)); }
    for (const path of ["/api/auth/me", "/api/repos", "/api/pdf/test", "/api/analytics/events"]) assert.equal((await fetch(origin + path)).status, 404);
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const context = await browser.createBrowserContext();
    async function setup(page) {
      page.setDefaultTimeout(20000);
      page.on("dialog", dialog => void dialog.accept());
      page.on("pageerror", error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on("request", async request => {
        const url = new URL(request.url());
        if (url.origin !== "https://api.github.com" && url.pathname.includes("private-image-sentinel")) forbidden.push(request.url());
        if (url.origin === origin && (url.pathname.startsWith("/api/") || request.postData()?.includes("test-token"))) forbidden.push(`${request.method()} ${url.pathname}`);
        try { if (!(await fixture.handle(request))) await request.continue(); } catch (error) { errors.push(error.message); await request.abort().catch(() => {}); }
      });
    }
    console.log("browser: connected");
    const page = await context.newPage(); await setup(page);
    await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluateOnNewDocument(() => {
      if (!localStorage.getItem("smoke-seeded")) {
        localStorage.setItem("marktwin:saved-repos", JSON.stringify([{ id: 101, displayName: "acme/rules", repoFullName: "acme/rules", defaultBranch: "main", selectedRootScopes: [".agents"], createdAt: "2026-01-01" }]));
        localStorage.setItem("marktwin-editor-preferences", JSON.stringify({ defaultMarkdownMode: "source", keepOfflineDrafts: true }));
        localStorage.setItem("smoke-seeded", "1");
      }
      sessionStorage.setItem("gh-token-101", "test-token");
    });
    console.log("browser: cabinets");
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await bodyIncludes(page, "acme/rules");
    assert.equal(await page.$('a[href="/signin"]'), null);
    const upgraded = await page.evaluate(() => JSON.parse(localStorage.getItem("marktwin:saved-repos"))[0]);
    assert.equal(upgraded.id, 101); assert.deepEqual(upgraded.selectedRootScopes, [".agents"]); assert.equal(upgraded.autoSync, false);
    await page.goto(`${origin}/cabinet/101`, { waitUntil: "domcontentloaded" });
    await bodyIncludes(page, "AGENTS.md");
    await page.click('[aria-label="Open AGENTS.md"]');
    await bodyIncludes(page, "Keep private work in the browser.");
    assert.equal(await page.$('[aria-label="Open README.md"]'), null);
    await page.click('[aria-label="Change editor view"]');
    await clickText(page, "Read-only preview");
    await page.waitForSelector('.marktwin-markdown .katex');
    await page.waitForSelector('.marktwin-mermaid svg', { timeout: 30000 });
    assert.equal(await page.$$eval('.marktwin-markdown img[src]', images => images.length), 0);
    await page.click('[aria-label="Change editor view"]');
    await clickText(page, "Source editor");
    await page.click('[aria-label="Open board.canvas"]');
    await page.waitForFunction(() => [...document.querySelectorAll("textarea")].some(node => node.value.includes("Canvas smoke test")));
    await page.click('textarea');
    await page.keyboard.type(" — edited in the browser");
    await page.click('[aria-label="Open sketch.excalidraw"]');
    await page.waitForSelector('.excalidraw canvas');
    await page.click('.excalidraw canvas');
    await page.keyboard.press('r');
    const drawingBounds = await page.$eval('.excalidraw canvas', canvas => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await page.mouse.move(drawingBounds.x + drawingBounds.width / 2, drawingBounds.y + drawingBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(drawingBounds.x + drawingBounds.width / 2 + 130, drawingBounds.y + drawingBounds.height / 2 + 90, { steps: 10 });
    await page.mouse.up();
    await page.screenshot({ path: join(tmpdir(), 'marktwin-oss-drawing.png') });
    await page.click('[aria-label="Open AGENTS.md"]');
    console.log("browser: formats loaded");
    await sourceAppend(page, "\nLocal checkpoint edit.");
    await page.waitForSelector('[aria-label="Unsynced changes"]');
    await page.click('[aria-label="Unsynced changes"]');
    await bodyIncludes(page, "Review changes before publishing");
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(node => /^Checkpoint .* to GitHub$/.test(node.textContent.trim())));
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(node => /^Checkpoint .* to GitHub$/.test(node.textContent.trim())).click());
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.waitForSelector('[aria-label="Synced"]');
    assert.equal(fixture.commits.length, 1);
    assert.match(fixture.snapshots.get(fixture.branches.get("main")).get(".agents/AGENTS.md"), /Local checkpoint edit/);

    console.log("browser: checkpoint succeeded");
    const committed = fixture.snapshots.get(fixture.branches.get("main"));
    assert.match(committed.get(".agents/board.canvas"), /edited in the browser/);
    assert.ok(JSON.parse(committed.get(".agents/sketch.excalidraw")).elements.length > 0);
    fixture.setFailPublication(true);
    await sourceAppend(page, "\nDraft survives a failed checkpoint.");
    await page.click('[aria-label="Unsynced changes"]');
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(node => /^Checkpoint .* to GitHub$/.test(node.textContent.trim())));
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(node => /^Checkpoint .* to GitHub$/.test(node.textContent.trim())).click());
    await bodyIncludes(page, "Simulated GitHub outage");
    fixture.setFailPublication(false);
    await page.keyboard.press("Escape");
    await page.waitForFunction(async () => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open("marktwin-workspace-recovery", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const records = await new Promise((resolve, reject) => { const request = db.transaction("drafts").objectStore("drafts").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      db.close(); return records.some(record => record.repoId === 101 && record.dirty);
    });
    console.log("browser: failed checkpoint retained; reload");
    await page.reload({ waitUntil: "domcontentloaded" });
    await bodyIncludes(page, "Local draft", 20000);
    // Recovery is an explicit choice when the saved draft differs from GitHub.
    const recoveryButtons = await page.$$eval('button', nodes => nodes.map(node => node.textContent.trim()));
    const recover = recoveryButtons.find(text => /recover.*draft|restore.*draft|open.*draft/i.test(text));
    if (recover) await clickText(page, recover);
    await bodyIncludes(page, "Draft survives a failed checkpoint.");

    console.log("browser: recovery restored");
    await page.click('[aria-label="More Cabinet actions"]');
    await clickText(page, "Start sharing session");
    await page.waitForFunction(() => document.querySelector('#share-edit')?.value.includes('/join#'));
    const links = await page.evaluate(() => ({ edit: document.querySelector('#share-edit').value, view: document.querySelector('#share-view').value }));
    assert.notEqual(links.edit, links.view);
    await page.keyboard.press("Escape");
    const editContext = await browser.createBrowserContext(); const viewContext = await browser.createBrowserContext();
    const editPage = await editContext.newPage(); const viewPage = await viewContext.newPage();
    for (const peer of [editPage, viewPage]) { await setup(peer); await peer.setViewport({ width: 1440, height: 1000 }); await peer.evaluateOnNewDocument(() => localStorage.setItem("marktwin-editor-preferences", JSON.stringify({ defaultMarkdownMode: "source" }))); }
    console.log("browser: joining peers");
    await Promise.all([editPage.goto(links.edit), viewPage.goto(links.view)]);
    await Promise.all([bodyIncludes(editPage, "AGENTS.md", 30000), bodyIncludes(viewPage, "AGENTS.md", 30000)]);
    for (const peer of [editPage, viewPage]) await peer.click('[aria-label="Open AGENTS.md"]');
    await sourceAppend(editPage, "\nLive editor change.");
    await Promise.all([bodyIncludes(page, "Live editor change."), bodyIncludes(viewPage, "Live editor change.")]);
    assert.equal(await viewPage.$('.cm-content[contenteditable="true"]'), null);
    assert.equal(await editPage.$('[aria-label="Unsynced changes"]'), null);
    assert.equal(await viewPage.$('[aria-label="Unsynced changes"]'), null);

    for (const peer of [page, editPage, viewPage]) await peer.click('[aria-label="Toggle Chat"]');
    await viewPage.type('[aria-label="Chat message"]', 'Viewer discussion stays encrypted.');
    await viewPage.click('[aria-label="Send chat message"]');
    await Promise.all([bodyIncludes(page, 'Viewer discussion stays encrypted.'), bodyIncludes(editPage, 'Viewer discussion stays encrypted.')]);
    await editPage.reload({ waitUntil: 'domcontentloaded' });
    await bodyIncludes(editPage, 'Connected with edit access', 30000);
    await editPage.click('[aria-label="Open AGENTS.md"]');
    await sourceAppend(editPage, "\nReconnected editor change.");
    await Promise.all([bodyIncludes(page, 'Reconnected editor change.'), bodyIncludes(viewPage, 'Reconnected editor change.')]);
    console.log("browser: collaboration, viewer chat and reconnect passed");
    for (const width of [390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `overflow at ${width}`);
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.screenshot({ path: join(tmpdir(), "marktwin-oss-workspace.png"), fullPage: true });
    await page.goto(`${origin}/user`);
    await bodyIncludes(page, "Collaboration profile");
    await page.$eval('#display-name', input => { input.value = ''; });
    await page.click('#display-name'); await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control'); await page.keyboard.press('a'); await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control'); await page.keyboard.type('Local Writer');
    await clickText(page, "Save"); await bodyIncludes(page, "Profile saved.");
    await page.reload(); await page.waitForSelector('#display-name');
    assert.equal(await page.$eval('#display-name', input => input.value), 'Local Writer');
    await page.click('[aria-label="Change profile color"]');
    await page.click('[aria-label="Blue profile color"]');
    await clickText(page, 'Save color');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.reload();
    const color = await page.evaluate(() => JSON.parse(localStorage.getItem('marktwin:local-profile')).appPreferences.avatarColorIndex);
    assert.equal(color, 1);
    assert.equal(await page.$$eval('img', images => images.length), 0);
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);
    assert.equal(logs.join('').includes('test-token'), false);
    assert.equal(logs.join('').includes('Live editor change'), false);
  } catch (error) {
    const pages = await browser?.pages();
    if (pages?.length) { await pages[1]?.screenshot({ path: join(tmpdir(), "marktwin-oss-failure.png") }).catch(() => {}); }
    throw new Error(`${error.stack}\nBrowser errors: ${errors.join("\n")}\nRecent GitHub requests: ${JSON.stringify(fixture.requests.slice(-12))}`);
  } finally { await browser?.close(); child.kill('SIGKILL'); }
});
