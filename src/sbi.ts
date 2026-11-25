import { csvRows, yen } from "./csv.ts";
import { collectStatementPages, statementPageUrl, statementPageSize } from "./statement-pages.ts";
import type { Coverage, Flow, FlowKind } from "./analytics.ts";

function classify(category: string, detail: string, incoming: boolean): FlowKind {
  if (category === "金融機関からの入金" && incoming) return "deposit";
  if (category === "金融機関への出金" && !incoming) return "withdrawal";
  if (incoming && detail === "投信積立クレジットカード入金") return "deposit";
  if (category === "ポイント" && incoming && detail.includes("ポイント")) return "deposit";
  if (category === "利金・配当金" || /^譲渡益税(?:徴収|還付)/u.test(detail)) return "internal";
  return "unknown";
}

export type Statement = Flow & { description: string; incoming: boolean };

export function readStatement(csv: string, requested: Coverage): Statement[] {
  const rows = csvRows(csv);
  const meta = rows.findIndex(row => row.includes("指定期間(開始)") && row.includes("明細数"));
  const field = (name: string) => rows[meta + 1]?.[rows[meta]?.indexOf(name)];
  if (meta < 0) throw new Error("円貨入出金CSVに照会条件の見出しがありません。");
  if (field("指定期間(開始)")?.replaceAll("/", "-") !== requested.start ||
      field("指定期間(終了)")?.replaceAll("/", "-") !== requested.end) {
    throw new Error("入出金CSVの照会期間を確認できません。");
  }
  if (field("指定取引区分")?.normalize("NFKC") !== "入金:すべて、出金:すべて") {
    throw new Error("全取引区分の明細を確認できません。");
  }
  const headers = ["入出金日", "取引", "区分", "摘要", "出金額", "入金額"];
  const index = rows.findIndex(row => headers.every(label => row.includes(label)));
  if (index <= meta || index < 0) throw new Error("入出金CSVの見出しがありません。");
  const header = rows[index];
  const columns = headers.map(label => header.indexOf(label));
  const body = rows.slice(index + 1);
  const count = field("明細数");
  if (!count || !/^\d+(?:,\d{3})*$/.test(count) || Number(count.replaceAll(",", "")) !== body.length) {
    throw new Error("入出金明細の件数が一致しません。");
  }
  return body.map(row => {
    const [day, direction, category, detail, debit, credit] = columns.map(i => row[i]);
    const incoming = direction === "入金";
    const date = day?.replaceAll("/", "-");
    if (row.length !== header.length || !/^\d{4}-\d\d-\d\d$/.test(date) ||
        date < requested.start || date > requested.end || (!incoming && direction !== "出金")) {
      throw new Error("入出金明細の日付・取引区分が不正です。");
    }
    let amount;
    try {
      amount = yen(incoming ? credit : debit);
      if (amount === null || (yen(incoming ? debit : credit) ?? 0) !== 0) throw new Error();
    } catch {
      throw new Error("入出金明細の金額欄を確認してください。");
    }
    return { date, yen: amount, incoming, kind: classify(category, detail, incoming), description: category + "／" + detail };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStatementPage(data: unknown, range: Coverage, number: number) {
  if (!isRecord(data) || !Array.isArray(data.depositRecordList) || typeof data.totalCount !== "number") {
    throw new Error("明細一覧のJSONに明細または総件数がありません。円貨入出金明細画面で照会できるか確認してください。");
  }
  if (data.exceededMaxCount === true || data.isExceededMaxCount === true) {
    throw new Error("明細が照会上限を超えています。照会期間を短くしてください。");
  }
  const total = data.totalCount;
  if (!Number.isSafeInteger(total) || total < 0 || data.pageNumber !== number ||
      data.pageSize !== statementPageSize ||
      (data.pageCount !== Math.ceil(total / statementPageSize) && !(total === 0 && data.pageCount === 1))) {
    throw new Error("明細一覧のページ情報が照会条件と一致しません。");
  }
  const conditions = data.detailsConditions;
  if (!Array.isArray(conditions) || conditions.length !== 2 ||
      !["入金:すべて", "出金:すべて"].every(label =>
        conditions.some(value => typeof value === "string" && value.normalize("NFKC") === label))) {
    throw new Error("全入出金を対象とする明細一覧を確認できません。");
  }
  const rows: Statement[] = data.depositRecordList.map((row: unknown) => {
    if (!isRecord(row) || typeof row.payDepDate !== "string" || typeof row.payAmount !== "string" ||
        typeof row.detailKbn !== "string" || typeof row.dispAbstract !== "string" ||
        (row.payDepKbn !== "入金" && row.payDepKbn !== "出金")) {
      throw new Error("明細一覧の日付・取引区分・金額の形式を確認してください。");
    }
    const date = row.payDepDate.replaceAll("/", "-");
    if (!/^\d{4}-\d\d-\d\d$/.test(date) || new Date(date).toJSON()?.slice(0, 10) !== date ||
        date < range.start || date > range.end) throw new Error("明細一覧の日付が不正または照会期間外です。");
    let amount;
    try {
      amount = yen(row.payAmount);
      if (amount === null) throw new Error();
    } catch {
      throw new Error("明細一覧の金額を円単位で読み取れません。");
    }
    const incoming = row.payDepKbn === "入金";
    const detail = row.dispAbstract.replace(/<br\s*\/?\s*>/gi, " ").replace(/\s+/gu, " ").trim();
    return { date, yen: amount, incoming, kind: classify(row.detailKbn, detail, incoming),
      description: row.detailKbn + "／" + detail };
  });
  return { total, rows };
}

type QueryResponse = { status: number; response: unknown; finalUrl?: string };
declare const GM: {
  xmlHttpRequest(options: { method: "GET"; url: string; responseType: "json"; timeout: number }):
    Promise<QueryResponse>;
};

export async function fetchStatement(range: Coverage) {
  if (typeof GM === "undefined" || typeof GM.xmlHttpRequest !== "function") {
    throw new Error("入出金明細の通信機能が使えません。Tampermonkeyでスクリプトの権限を確認してください。");
  }
  return collectStatementPages(async number => {
    const url = statementPageUrl(range, number);
    let response: QueryResponse;
    try {
      response = await GM.xmlHttpRequest({ method: "GET", url, responseType: "json", timeout: 30000 });
    } catch {
      throw new Error("入出金明細のHTTP応答を受信できません。Tampermonkeyの接続許可を確認してください。");
    }
    if (!response.status) throw new Error("入出金明細のHTTP応答を受信できません。");
    if (response.status !== 200) throw new Error(`入出金明細の取得に失敗しました（HTTP ${response.status}）。`);
    if (response.finalUrl && response.finalUrl.split("?")[0] !== url.split("?")[0]) {
      throw new Error("入出金明細の取得先から別のページへ転送されました。円貨入出金明細画面を開いてください。");
    }
    return readStatementPage(response.response, range, number);
  });
}

export async function fetchBalances(): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch("https://site.sbisec.co.jp/account/api/assets/valuations", {
      headers: { Accept: "application/json" },
      credentials: "same-origin", mode: "same-origin", redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(30000)
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("資産評価額の応答が30秒以内に返りませんでした。");
    }
    throw new Error("資産評価額の通信に失敗しました（HTTP応答なし）。");
  }
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new Error("資産評価額の取得先から別画面への転送が返りました。My資産を開き直してください。");
  }
  if (!response.ok) {
    throw new Error(`資産評価額の取得に失敗しました（HTTP ${response.status}）。`);
  }
  const body = await response.text().catch(() => {
    throw new Error("資産評価額の応答を最後まで受信できませんでした。");
  });
  if (body.trimStart().startsWith("<")) {
    throw new Error(`資産評価額の代わりに画面が返りました（HTTP ${response.status}）。`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`資産評価額の応答をJSONとして読み取れません（HTTP ${response.status}）。`);
  }
}
