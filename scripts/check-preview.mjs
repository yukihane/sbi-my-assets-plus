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
      const balancesWithoutDepositAndIdeco = [[balances[0][0], 4000]];
      files.items.add(new File([JSON.stringify({ balances, balancesWithoutDepositAndIdeco })], "fixture.json"));
      input.files = files.files;
      input.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      return root.querySelector("tbody tr")?.textContent.includes("2040-01-01");
    });
    assert.deepEqual(await read(), { profit: "—", charts: 2, rows: 1, error: "" });
    await page.evaluate(() => {
      const select = document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("[name=scope]");
      select.value = "balancesWithoutDepositAndIdeco";
      select.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() =>
      document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("tbody td:nth-child(2)")?.textContent === "4,000 円");
    // Serve a local fixture at the target URL. No request goes to the real site.
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.isNavigationRequest()) {
        void request.respond({ contentType: "text/html", body: "<main></main>" });
      } else if (request.url() === "https://site.sbisec.co.jp/account/api/assets/valuations") {
        const balances = [
          [Date.parse("2025-01-01T00:00:00+09:00"), 1000000],
          [Date.parse("2025-01-08T00:00:00+09:00"), 1230000]
        ];
        void request.respond({ contentType: "application/json", body: JSON.stringify({ balances }) });
      } else {
        void request.abort();
      }
    });
    await page.goto("https://site.sbisec.co.jp/account/assets");
    await page.evaluate(() => {
      globalThis.GM = { async xmlHttpRequest({ url }) {
        const expected = "https://member.c.sbisec.co.jp/banking/api/yen/detail/download";
        const target = new URL(url);
        if (target.origin + target.pathname !== expected || target.searchParams.get("pageSize") !== "-1" ||
            target.searchParams.get("depositDateFrom") !== "20250101" ||
            target.searchParams.get("depositDateTo") !== "20250108") throw new Error("Unexpected CSV request");
        const csv = [
          "指定期間(開始),指定期間(終了),明細数,指定取引区分",
          "2025/01/01,2025/01/08,1,入金:すべて、出金:すべて",
          "入出金日,取引,区分,摘要,出金額,入金額",
          "2025/01/06,入金,金融機関からの入金,テスト振込,0,200000"
        ].join("\n");
        return { status: 200, finalUrl: url, response: new TextEncoder().encode(csv).buffer };
      }};
    });
    await page.addScriptTag({ path: fileURLToPath(new URL("../dist/sbi-my-assets-plus.user.js", import.meta.url)) });
    assert.ok(await page.evaluate(() => {
      const root = document.querySelector("main #sbi-my-assets-plus")?.shadowRoot;
      return root?.querySelector("button") && !root.querySelector("input[type=file]")
        && !root.querySelector("tbody");
    }));
    await page.evaluate(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      const [start, end] = root.querySelectorAll("input[type=date]");
      start.value = "2025-01-01"; end.value = "2025-01-08";
      root.querySelector("form").requestSubmit();
    });
    await page.waitForFunction(() =>
      document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("dd")?.textContent === "1,030,000 円");
    console.log(await browser.version(), "プレビュー・模擬サービスからの取得と集計 OK");
  } finally {
    await browser.close();
  }
}
