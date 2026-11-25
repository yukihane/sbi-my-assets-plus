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
    let valuationStatus = 403;
    page.on("request", request => {
      if (request.isNavigationRequest()) {
        void request.respond({ contentType: "text/html", body: "<main></main>" });
      } else if (request.url() === "https://site.sbisec.co.jp/account/api/assets/valuations") {
        const balances = [
          [Date.parse("2025-01-01T00:00:00+09:00"), 1000000],
          [Date.parse("2025-01-08T00:00:00+09:00"), 1230000]
        ];
        void request.respond({ status: valuationStatus, contentType: "text/plain", body: JSON.stringify({ balances }) });
      } else {
        void request.abort();
      }
    });
    await page.goto("https://site.sbisec.co.jp/account/assets");
    await page.evaluate(() => {
      globalThis.GM = { async xmlHttpRequest({ method, url, responseType }) {
        const expected = "https://member.c.sbisec.co.jp/banking/api/yen/detail/query";
        const target = new URL(url);
        if (method !== "GET" || responseType !== "json" ||
            target.origin + target.pathname !== expected || target.searchParams.get("pageSize") !== "10" ||
            target.searchParams.get("depositDateFrom") !== "20250101" ||
            target.searchParams.get("depositDateTo") !== "20250108") throw new Error("Unexpected query request");
        const pageNumber = Number(target.searchParams.get("pageNumber"));
        const row = { payDepDate: "2025/01/06", payDepKbn: "入金", detailKbn: "金融機関からの入金", dispAbstract: "テスト振込" };
        return { status: 200, finalUrl: url, response: {
          totalCount: 11, pageSize: 10, pageNumber, pageCount: 2,
          detailsConditions: ["入金：すべて", "出金：すべて"], exceededMaxCount: false, isExceededMaxCount: false,
          depositRecordList: pageNumber === 1 ? Array(10).fill({ ...row, payAmount: "10000" }) : [{ ...row, payAmount: "100000" }]
        } };
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
      document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("[role=alert]")?.textContent.includes("HTTP 403"));
    valuationStatus = 200;
    await page.evaluate(() => {
      const query = GM.xmlHttpRequest;
      GM.xmlHttpRequest = async (...args) => {
        if (new URL(args[0].url).searchParams.get("pageNumber") === "1") return query(...args);
        GM.xmlHttpRequest = query;
        return { status: 403, response: null };
      };
      document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("form").requestSubmit();
    });
    await page.waitForFunction(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      return root.querySelector("[role=alert]")?.textContent.includes("入出金明細の取得に失敗しました（HTTP 403）")
        && root.querySelector("tbody tr");
    });
    await page.evaluate(() => document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("form").requestSubmit());
    await page.waitForFunction(() =>
      document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("dd")?.textContent === "1,030,000 円");
    console.log(await browser.version(), "プレビュー・模擬サービスからの取得と集計 OK");
  } finally {
    await browser.close();
  }
}
