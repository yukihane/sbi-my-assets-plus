import { csvRows, decodeCsv, yen } from "./csv.ts";
import type { Coverage, Flow, FlowKind } from "./analytics.ts";

export const downloadPath = "https://member.c.sbisec.co.jp/banking/api/yen/detail/download";

export function downloadUrl(range: Coverage) {
  const url = new URL(downloadPath);
  url.search = new URLSearchParams({
    depositDateFrom: range.start.replaceAll("-", ""), depositDateTo: range.end.replaceAll("-", ""),
    payDepKbnList: "1,2,6,5", detailKbnList: "11,12,13,14,15,16,17,18,21,22,23,24",
    sortDateType: "1", pageNumber: "0", pageSize: "-1", totalCountKbn: "1"
  }).toString();
  return url.href;
}

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

type DownloadResponse = { status: number; response: ArrayBuffer | string | null; finalUrl?: string };
declare const GM: {
  xmlHttpRequest(options: { method: "GET"; url: string; responseType: "arraybuffer"; timeout: number }):
    Promise<DownloadResponse>;
};

export async function fetchStatement(range: Coverage) {
  if (typeof GM === "undefined" || typeof GM.xmlHttpRequest !== "function") {
    throw new Error("入出金明細の通信機能が使えません。Tampermonkeyでスクリプトの権限を確認してください。");
  }
  let response: DownloadResponse;
  try {
    response = await GM.xmlHttpRequest({
      method: "GET", url: downloadUrl(range), responseType: "arraybuffer", timeout: 30000
    });
  } catch {
    throw new Error("入出金明細のHTTP応答を受信できません。Tampermonkeyの接続許可を確認してください。");
  }
  if (!response.status) throw new Error("入出金明細のHTTP応答を受信できません。");
  if (response.status !== 200) throw new Error(`入出金明細の取得に失敗しました（HTTP ${response.status}）。`);
  if (response.finalUrl && response.finalUrl.split("?")[0] !== downloadPath) {
    throw new Error("入出金明細の取得先から別のページへ転送されました。円貨入出金明細画面を開いてください。");
  }
  if (!response.response) throw new Error("入出金明細の応答が空です（HTTP 200）。");
  let csv: string;
  try {
    csv = typeof response.response === "string" ? response.response : decodeCsv(response.response);
  } catch {
    throw new Error("入出金明細の文字コードを読み取れません（HTTP 200）。");
  }
  const first = csv.trimStart()[0];
  if (!first) throw new Error("入出金明細の応答が空です（HTTP 200）。");
  if (first === "<") throw new Error("入出金明細の代わりにHTMLが返りました（HTTP 200）。円貨入出金明細画面を確認してください。");
  if (first === "{" || first === "[") throw new Error("入出金明細のCSV取得先からJSONが返りました（HTTP 200）。");
  return readStatement(csv, range);
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
