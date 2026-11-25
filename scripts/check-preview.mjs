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
      document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("input[type=file]"));
    await input.uploadFile(csv);
    await page.evaluate(() => document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("form").requestSubmit());
    await page.waitForFunction(() => document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("tbody"));
    assert.deepEqual(await read(), expected);
    console.log(await browser.version(), "プレビュー・CSV再取込 OK");
  } finally {
    await browser.close();
  }
}
