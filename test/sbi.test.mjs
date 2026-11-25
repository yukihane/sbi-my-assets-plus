import assert from "node:assert/strict";
import test from "node:test";
import { downloadUrl, readStatement } from "../src/sbi.ts";

const range = { start: "2040-01-01", end: "2040-01-31" };
const csv = [
  "指定期間(開始),指定期間(終了),明細数,指定取引区分",
  "2040/01/01,2040/01/31,2,入金：すべて、出金：すべて",
  "入出金日,取引,区分,摘要,出金額,入金額",
  "2040/01/12,入金,金融機関からの入金,架空の入金,0,200000",
  "2040/01/14,出金,その他,架空の振替,120,0"
].join("\n");

test("SBIの一括照会期間・件数・入出金方向を照合する", () => {
  const url = new URL(downloadUrl(range));
  assert.equal(url.searchParams.get("depositDateTo"), "20400131");
  assert.equal(url.searchParams.get("pageNumber"), "0");
  assert.equal(url.searchParams.get("pageSize"), "-1");
  assert.deepEqual(readStatement(csv, range).map(x => [x.kind, x.yen]), [["deposit", 200000], ["unknown", 120]]);
  for (const bad of [csv.replace(",2,", ",3,"), csv.replace("入金：すべて", "絞り込み"),
    csv.replace("2040/01/31", "2040/01/30"), csv.replace(",120,0", ",120,120"), "<html>Login</html>"]) {
    assert.throws(() => readStatement(bad, range));
  }
});
