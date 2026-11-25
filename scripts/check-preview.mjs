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
        profit: root.querySelector("dl div:nth-child(2) dd")?.textContent,
        charts: root.querySelectorAll("canvas[role=img]").length,
        rows: root.querySelectorAll("tbody tr").length,
        error: root.querySelector("[role=alert]").textContent
      };
    });
    const expected = { profit: "+30,800 円", charts: 2, rows: 4, error: "" };
    assert.deepEqual(await read(), expected);
    const changeBase = date => page.evaluate(value => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      const select = root.querySelector("[name=baseDate]");
      select.value = value;
      select.dispatchEvent(new Event("change"));
      return {
        base: select.value,
        firstProfit: root.querySelector("tbody tr td:nth-child(5)").textContent,
        chartStarts: [...root.querySelectorAll("figure select")].map(input => input.options[0].value),
        lastAmounts: [...root.querySelectorAll("figure")].map(fig => [...fig.querySelectorAll("figcaption strong")].at(-1).textContent)
      };
    }, date);
    const mid = await changeBase("2026-01-10");
    assert.equal(mid.firstProfit, "0 円");
    assert.deepEqual(mid.chartStarts, ["2026-01-10", "2026-01-10"]);
    assert.deepEqual(mid.lastAmounts, ["1,230,800 円", "800 円"]);
    assert.deepEqual(await read(), { ...expected, profit: "+800 円", rows: 3 });
    await changeBase("");
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
        const row = { payDepDate: "2025/01/08", payDepKbn: "入金", detailKbn: "金融機関からの入金", dispAbstract: "テスト振込" };
        return { status: 200, finalUrl: url, response: {
          totalCount: 12, pageSize: 10, pageNumber, pageCount: 2,
          detailsConditions: ["入金：すべて", "出金：すべて"], exceededMaxCount: false, isExceededMaxCount: false,
          depositRecordList: pageNumber === 1 ? Array(10).fill({ ...row, payAmount: "30000" }) :
            ["40000", "60000"].map(payAmount => ({
              ...row, payDepKbn: "出金", detailKbn: "その他", dispAbstract: "", payAmount
            }))
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
    await page.waitForFunction(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      return root.querySelector("dd")?.textContent === "1,030,000 円" &&
        root.querySelector("dl div:nth-child(2) dd")?.textContent === "+30,000 円";
    });
    const inspection = await page.evaluate(() => {
      const figure = document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("figure");
      const amounts = () => [...figure.querySelectorAll("figcaption strong")].map(node => node.textContent);
      const dates = figure.querySelector("select");
      const latest = amounts(), initialDate = dates.value;
      dates.selectedIndex = 0;
      dates.dispatchEvent(new Event("change"));
      const first = amounts();
      const plot = figure.querySelector("canvas[role=img]");
      plot.dispatchEvent(new PointerEvent("pointerdown", { clientX: plot.getBoundingClientRect().right }));
      // Discard hue and brightness. The four swatches must retain different silhouettes.
      const masks = [...figure.querySelectorAll("figcaption canvas")].map(canvas => {
        const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        return data.filter((_, i) => i % 4 === 3).map(alpha => Number(alpha > 127)).join("");
      });
      return { latest, first, initialDate, pointerDate: dates.value, silhouettes: new Set(masks).size };
    });
    assert.deepEqual(inspection, {
      latest: ["1,230,000 円", "1,200,000 円", "30,000 円", "1,030,000 円"],
      first: ["1,000,000 円", "1,000,000 円", "0 円", "1,000,000 円"],
      initialDate: "2025-01-08", pointerDate: "2025-01-08", silhouettes: 4
    });
    const last = await changeBase("2025-01-08");
    assert.equal(last.firstProfit, "0 円");
    assert.deepEqual(await read(), { profit: "0 円", charts: 2, rows: 1, error: "" });
    await page.evaluate(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      root.querySelector("details summary").click();
      const labels = [...root.querySelectorAll("details[open] label")];
      const select = labels.find(label => label.textContent.includes("2025-01-08") && label.textContent.includes("40,000 円")).querySelector("select");
      select.value = "internal";
      select.dispatchEvent(new Event("change"));
    });
    assert.equal(await page.evaluate(() =>
      document.querySelector("#sbi-my-assets-plus").shadowRoot.querySelector("[name=baseDate]").value), "2025-01-08");
    await changeBase("");
    await page.waitForFunction(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      return root.querySelector("dd")?.textContent === "990,000 円" &&
        root.querySelector("dl div:nth-child(2) dd")?.textContent === "-10,000 円";
    });
    await page.evaluate(() => {
      const root = document.querySelector("#sbi-my-assets-plus").shadowRoot;
      const group = [...root.querySelectorAll("details[open] label")].find(label => label.textContent.includes("全2件"));
      const select = group.querySelector("select");
      select.value = "internal";
      select.dispatchEvent(new Event("change"));
    });
    assert.equal((await read()).profit, "-70,000 円");
    console.log(await browser.version(), "プレビュー・模擬サービスからの取得と集計 OK");
  } finally {
    await browser.close();
  }
}
