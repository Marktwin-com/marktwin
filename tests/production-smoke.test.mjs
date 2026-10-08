import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import puppeteer from "puppeteer";

async function portNumber() {
  return new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); }); });
}

test("production starts without hosted services and renders the tutorial with local-only printing", { timeout: 90000 }, async () => {
  const port = await portNumber(); const origin = `http://127.0.0.1:${port}`; const logs = [];
  const server = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, NODE_ENV: "production", PORT: String(port), DATABASE_URL: "", SESSION_SECRET: "", TURN_SECRET: "" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", chunk => logs.push(String(chunk))); server.stderr.on("data", chunk => logs.push(String(chunk)));
  let browser;
  try {
    let response;
    for (let i = 0; i < 100; i++) { try { response = await fetch(origin); if (response.ok) break; } catch {} if (server.exitCode !== null) throw new Error(logs.join("")); await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(response?.status, 200);
    assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal((await fetch(`${origin}/api/repos`)).status, 404);
    assert.equal((await fetch(`${origin}/api/pdf/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown: "private-production-sentinel" }) })).status, 404);
    assert.equal((await fetch(`${origin}/api/repos?token=private-query-sentinel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"broken": "private-malformed-sentinel"' })).status, 404);
    const invalidPath = await fetch(`${origin}/%C0%AE`);
    assert.equal(invalidPath.status, 400);
    assert.equal(await (await fetch(origin)).status, 200);
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage(); const failures = []; const requests = [];
    page.on("pageerror", error => failures.push(error.message));
    page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url()); });
    await page.goto(origin); await page.waitForFunction(() => document.body.innerText.includes("Cabinet"));
    assert.equal(await page.$('a[href="/signin"]'), null);
    await page.goto(`${origin}/cabinet/documentation`);
    await page.waitForSelector('.cm-content', { timeout: 30000 });
    await page.click('[aria-label="More Cabinet actions"]');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Print / Save as PDF')));
    const popupPromise = new Promise(resolve => page.once('popup', resolve));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Print / Save as PDF')).click());
    const popup = await popupPromise;
    await popup.waitForFunction(() => document.body.innerText.length > 20);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(await popup.$$eval('script, iframe, object, embed, img, form', nodes => nodes.length), 0);
    assert.match(await popup.$eval('meta[http-equiv="Content-Security-Policy"]', node => node.content), /default-src 'none'/);
    await popup.close();
    await page.keyboard.press('Escape');
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: join(tmpdir(), "marktwin-oss-production-mobile.png") });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(requests, []); assert.deepEqual(failures, []);
    for (const secret of ['private-production-sentinel', 'private-query-sentinel', 'private-malformed-sentinel']) assert.equal(logs.join('').includes(secret), false);
  } finally { await browser?.close(); server.kill('SIGKILL'); }
});
