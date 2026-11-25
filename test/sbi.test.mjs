import assert from "node:assert/strict";
import test from "node:test";
import { fetchBalances, fetchStatement, readStatement, readStatementPage } from "../src/sbi.ts";

const range = { start: "2040-01-01", end: "2040-01-31" };
const csv = [
  "指定期間(開始),指定期間(終了),明細数,指定取引区分",
  "2040/01/01,2040/01/31,2,入金：すべて、出金：すべて",
  "入出金日,取引,区分,摘要,出金額,入金額",
  "2040/01/12,入金,金融機関からの入金,架空の入金,0,200000",
  "2040/01/14,出金,その他,架空の振替,120,0"
].join("\n");

test("SBIの一括照会期間・件数・入出金方向を照合する", () => {
  assert.deepEqual(readStatement(csv, range).map(x => [x.kind, x.yen, x.defaulted]),
    [["deposit", 200000, false], ["withdrawal", 120, true]]);
  for (const bad of [csv.replace(",2,", ",3,"), csv.replace("入金：すべて", "絞り込み"),
    csv.replace("2040/01/31", "2040/01/30"), csv.replace(",120,0", ",120,120"), "<html>Login</html>"]) {
    assert.throws(() => readStatement(bad, range));
  }
});

const records = [
  { payDepDate: "2040/01/12", payDepKbn: "入金", detailKbn: "金融機関からの入金", dispAbstract: "架空の入金", payAmount: "200,000" },
  { payDepDate: "2040/01/14", payDepKbn: "出金", detailKbn: "その他", dispAbstract: "架空の<br/>振替", payAmount: "120" }
];
const page = {
  totalCount: 2, pageNumber: 1, pageCount: 1, pageSize: 10, detailsConditions: ["入金：すべて", "出金：すべて"],
  exceededMaxCount: false, isExceededMaxCount: false, depositRecordList: records
};

test("一覧JSONの方向・円金額・摘要を正規化し、途中のページや不完全な照会を検出する", () => {
  assert.deepEqual(readStatementPage(page, range, 1).rows, readStatement(csv.replace("架空の振替", "架空の 振替"), range));
  for (const changes of [{ pageNumber: 2 }, { exceededMaxCount: true }, { detailsConditions: ["入金：すべて"] },
    { depositRecordList: [{ ...records[1], payAmount: "" }] },
    { depositRecordList: [{ ...records[0], payDepDate: "2039/01/01" }] }]) {
    assert.throws(() => readStatementPage({ ...page, ...changes }, range, 1));
  }
});

test("明細の取得と検証の失敗を区別し、応答本文や転送先をエラーに含めない", async t => {
  let response = { status: 200, response: page };
  globalThis.GM = { xmlHttpRequest: async () => response };
  t.after(() => { delete globalThis.GM; });
  assert.equal((await fetchStatement(range)).length, 2);
  for (const [changes, expected] of [
    [{ status: 403 }, /HTTP 403/],
    [{ status: 0 }, /HTTP応答/],
    [{ finalUrl: "https://example.invalid/private-fixture" }, /転送/],
    [{ response: { reason: "private-fixture" } }, /JSON/],
    [{ response: null }, /JSON/],
    [{ response: { ...page, depositRecordList: [{ ...records[0], payAmount: "private-fixture" }] } }, /金額/]
  ]) {
    response = { status: 200, response: page, ...changes };
    await assert.rejects(fetchStatement(range), e => expected.test(e.message) && !e.message.includes("private-fixture"));
  }
  globalThis.GM.xmlHttpRequest = async () => { throw new Error("private-fixture"); };
  await assert.rejects(fetchStatement(range), /HTTP応答を受信できません/);
});

test("資産評価額のJSON本文を読み、ログイン・通信・形式の失敗を区別する", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", () => Response.json({ balances: [] }));
  assert.deepEqual(await fetchBalances(), { balances: [] });
  const [url, init] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://site.sbisec.co.jp/account/api/assets/valuations");
  assert.equal(init.headers.Accept, "application/json");
  fetchMock.mock.mockImplementation(() => new Response('{"balances":[]}'));
  assert.deepEqual(await fetchBalances(), { balances: [] });
  for (const [body, status, expected] of [
    ["private fixture", 403, /HTTP 403/],
    ["", 302, /転送/],
    ["<html>private fixture</html>", 200, /画面が返り/],
    ["private fixture", 200, /JSONとして/]
  ]) {
    fetchMock.mock.mockImplementation(() => new Response(body, { status }));
    await assert.rejects(fetchBalances(), err => expected.test(err.message) && !err.message.includes("private fixture"));
  }
  fetchMock.mock.mockImplementation(() => { throw new TypeError("network"); });
  await assert.rejects(fetchBalances(), /HTTP応答なし/);
});
