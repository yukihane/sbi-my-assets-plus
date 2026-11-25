import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { launch } from "puppeteer-core";

const browsers = {
  chrome: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  firefox: process.env.FIREFOX_PATH ?? "C:/Program Files/Mozilla Firefox/firefox.exe"
};
const preview = new URL("../dist/sbi-my-assets-plus-preview.html", import.meta.url);
const csv = fileURLToPath(new URL("../dist/sample.csv", import.meta.url));
for (const [name, executablePath] of Object.entries(browsers)) {
  const browser = await launch({ browser: name, executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(preview.href);
    const read = () => page.evaluate(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      return {
        profit: [...root.querySelectorAll("dd")].at(-1)?.textContent,
        charts: root.querySelectorAll("canvas").length,
        rows: root.querySelectorAll("tbody tr").length,
        error: root.querySelector("[role=alert]").textContent
      };
    });
    const expected = { profit: "30,800 円", charts: 2, rows: 4, error: "" };
    assert.deepEqual(await read(), expected);
    const input = await page.evaluateHandle(() =>
      document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("input[name=csv]"));
    await input.uploadFile(csv);
    await page.evaluate(() => document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("form").requestSubmit());
    await page.waitForFunction(() => document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("tbody"));
    assert.deepEqual(await read(), expected);
    await page.evaluate(() => {
      const input = document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("input[name=json]");
      const files = new DataTransfer();
      const balances = [[Date.parse("2040-01-01T00:00:00+09:00"), 765432]];
      files.items.add(new File([JSON.stringify({ balances })], "fixture.json"));
      input.files = files.files;
      input.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      return root.querySelector("tbody tr")?.textContent.includes("2040-01-01");
    });
    assert.deepEqual(await read(), { profit: "—", charts: 2, rows: 1, error: "" });
    // Serve a local fixture at the target URL. No request goes to the real site.
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.isNavigationRequest()) {
        void request.respond({ contentType: "text/html", body: "<main></main>" });
      } else {
        void request.abort();
      }
    });
    await page.goto("https://site.sbisec.co.jp/account/assets");
    await page.addScriptTag({ path: fileURLToPath(new URL("../dist/sbi-my-assets-plus.user.js", import.meta.url)) });
    assert.ok(await page.evaluate(() => {
      const root = document.querySelector("main #sbi-my-assets-plus")?.shadowRoot;
      return root?.querySelector("input[name=json]") && !root.querySelector("#sample")
        && !root.querySelector("tbody");
    }));
    console.log(await browser.version(), "プレビュー・CSV再取込・評価額JSON読込 OK");
  } finally {
    await browser.close();
  }
}
