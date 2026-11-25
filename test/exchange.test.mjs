import test from "node:test";
import assert from "node:assert/strict";
import { adjacentBusinessDay } from "../src/business-day.ts";
import { fetchExchanges, reconcileExchanges } from "../src/exchange.ts";

const range = { start: "2025-05-07", end: "2025-05-09" };
function order(index) {
  return { orderNo: String(index), orderEventId: "fixture-" + index, businessDate: "2025-05-02",
    currencyCode: "USD", exchangeOrderStatus: "COMPLETED", displayOrderStatus: "ORDER_FINISHED",
    exchangeTradeType: "REAL", buySellCode: "BUY", netAmount: String(1000 + index) };
}
function mockPage(rows, number) {
  return { message: null, orderDetails: rows.slice((number - 1) * 10, number * 10),
    page: { pageNum: number, pageSize: 10, totalCount: rows.length, firstPage: number === 1,
      hasPreviousPage: number > 1, lastPage: number * 10 >= rows.length, hasNextPage: number * 10 < rows.length } };
}

test("期間開始日の受渡を含め、祝日をまたぐ約定を全ページから取得する", async t => {
  const orders = Array.from({ length: 11 }, (_, i) => order(i));
  orders[1].exchangeOrderStatus = "CANCELED";
  orders[1].displayOrderStatus = "CANCELED";
  orders[2].currencyCode = "EUR";
  orders.at(-1).buySellCode = "SELL";
  const calls = [];
  t.mock.method(globalThis, "fetch", (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin + target.pathname, "https://site.sbisec.co.jp/exchange/api/order/histories");
    assert.equal(target.searchParams.get("businessDateFrom"), "2025-05-02");
    assert.equal(target.searchParams.get("businessDateTo"), range.end);
    assert.equal(target.searchParams.get("pageSize"), "10");
    assert.equal(options.credentials, "same-origin");
    const page = Number(target.searchParams.get("pageNum"));
    calls.push(page);
    return Response.json(mockPage(orders, page));
  });
  const parsed = await fetchExchanges(range);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(parsed.length, 9);
  assert.deepEqual(parsed[0], { settlement: range.start, incoming: false, yen: 1000 });
  assert.deepEqual(parsed.at(-1), { settlement: range.start, incoming: true, yen: 1010 });
  assert.equal(adjacentBusinessDay("2024-12-30", 1), "2025-01-06");
});

test("重複ページ・途中の件数変更・不正な確定金額で部分結果を返さない", async t => {
  const rows = Array.from({ length: 11 }, (_, i) => order(i));
  const fetch = t.mock.method(globalThis, "fetch");
  for (const corrupt of [
    p => { p.orderDetails[0] = rows[0]; }, p => { p.page.totalCount++; },
    p => { p.orderDetails[0] = { ...p.orderDetails[0], netAmount: "" }; }, p => { p.page.hasNextPage = true; }
  ]) {
    fetch.mock.mockImplementation(url => {
      const n = Number(new URL(url).searchParams.get("pageNum")), page = mockPage(rows, n);
      if (n === 2) corrupt(page);
      return Response.json(page);
    });
    await assert.rejects(fetchExchanges(range));
  }
});

test("その他の同日・同額・同方向だけを照合し、重複候補は未確定にする", () => {
  const withdrawal = { date: range.start, incoming: false, yen: 400, kind: "withdrawal", defaulted: true, description: "その他／" };
  const deposit = { ...withdrawal, incoming: true, kind: "deposit" };
  const fx = { settlement: range.start, incoming: false, yen: 400 };
  const rows = [withdrawal, deposit, { ...withdrawal, description: "金融機関への出金／", defaulted: false }];
  assert.deepEqual(reconcileExchanges(rows, [fx]), { matched: 1, unresolved: 0 });
  assert.deepEqual(rows.map(row => row.kind), ["internal", "deposit", "withdrawal"]);
  for (const [numRows, numOrders] of [[2, 1], [1, 2]]) {
    const candidates = Array.from({ length: numRows }, () => ({ ...deposit }));
    const orders = Array(numOrders).fill({ ...fx, incoming: true });
    assert.deepEqual(reconcileExchanges(candidates, orders), { matched: 0, unresolved: numOrders });
    assert.ok(candidates.every(row => row.kind === "unknown"));
  }
});
