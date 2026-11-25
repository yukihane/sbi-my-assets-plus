import assert from "node:assert/strict";
import test from "node:test";
import { collectStatementPages, statementPageUrl } from "../src/statement-pages.ts";

const row = { date: "2040-01-02", yen: 100, kind: "deposit", incoming: true, description: "架空の明細" };

test("一覧は1ページ目から取得し、同一内容の別取引もすべて保持する", async () => {
  const range = { start: "2040-01-01", end: "2040-01-31" };
  const url = new URL(statementPageUrl(range, 2));
  assert.equal(url.pathname, "/banking/api/yen/detail/query");
  assert.equal(url.searchParams.get("pageNumber"), "2");
  assert.equal(url.searchParams.get("pageSize"), "10");
  assert.equal(url.searchParams.get("depositDateFrom"), "20400101");
  for (const total of [0, 10, 13]) {
    const calls = [];
    const result = await collectStatementPages(async number => {
      calls.push(number);
      return { total, rows: Array(Math.min(10, total - (number - 1) * 10)).fill(row) };
    });
    assert.equal(result.length, total);
    assert.deepEqual(calls, total <= 10 ? [1] : [1, 2]);
  }
});

test("途中の欠落・件数変更・通信失敗は部分的な成功として返さない", async () => {
  for (const total of [12, 13]) {
    await assert.rejects(collectStatementPages(async number => number === 1
      ? { total: 13, rows: Array(10).fill(row) } : { total, rows: [] }), /件数/);
  }
  await assert.rejects(collectStatementPages(async () => ({ total: 501, rows: [] })), /照会上限/);
  await assert.rejects(collectStatementPages(async number => {
    if (number === 2) throw new Error("通信失敗");
    return { total: 11, rows: Array(10).fill(row) };
  }), /通信失敗/);
});
