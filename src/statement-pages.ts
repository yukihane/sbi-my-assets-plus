import type { Coverage } from "./analytics.ts";
import type { Statement } from "./sbi.ts";

export const statementPageSize = 10;

export function statementPageUrl(range: Coverage, number: number) {
  const url = new URL("https://member.c.sbisec.co.jp/banking/api/yen/detail/query");
  url.search = new URLSearchParams({
    depositDateFrom: range.start.replaceAll("-", ""), depositDateTo: range.end.replaceAll("-", ""),
    payDepKbnList: "1,2,6,5", detailKbnList: "11,12,13,14,15,16,17,18,21,22,23,24",
    sortDateType: "1", pageNumber: String(number), pageSize: String(statementPageSize), totalCountKbn: "1"
  }).toString();
  return url.href;
}

type StatementPage = { total: number; rows: Statement[] };

export async function collectStatementPages(getPage: (number: number) => Promise<StatementPage>) {
  const rows: Statement[] = [];
  let expected: number | undefined;
  for (let number = 1; ; number++) {
    const page = await getPage(number);
    if (!Number.isSafeInteger(page.total) || page.total < 0) throw new Error("明細の総件数が不正です。");
    if (page.total > 500) throw new Error("明細が1回の照会上限500件を超えています。照会期間を短くしてください。");
    expected ??= page.total;
    if (page.total !== expected || page.rows.length !== Math.min(statementPageSize, expected - rows.length)) {
      throw new Error("明細のページ件数が一致しません。もう一度更新してください。");
    }
    rows.push(...page.rows);
    if (rows.length === expected) return rows;
  }
}
