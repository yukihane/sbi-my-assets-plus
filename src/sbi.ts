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
  if (meta < 0 || field("指定期間(開始)")?.replaceAll("/", "-") !== requested.start ||
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
  if (!count || yen(count) !== body.length) throw new Error("入出金明細の件数が一致しません。");
  return body.map(row => {
    const [day, direction, category, detail, debit, credit] = columns.map(i => row[i]);
    const incoming = direction === "入金";
    const date = day?.replaceAll("/", "-");
    if (row.length !== header.length || !/^\d{4}-\d\d-\d\d$/.test(date) ||
        date < requested.start || date > requested.end || (!incoming && direction !== "出金")) {
      throw new Error("入出金明細の日付・取引区分が不正です。");
    }
    const amount = yen(incoming ? credit : debit);
    if (amount === null || (yen(incoming ? debit : credit) ?? 0) !== 0) {
      throw new Error("入出金明細の金額欄を確認してください。");
    }
    return { date, yen: amount, incoming, kind: classify(category, detail, incoming), description: category + "／" + detail };
  });
}

declare const GM: {
  xmlHttpRequest(options: { method: "GET"; url: string; responseType: "arraybuffer"; timeout: number }):
    Promise<{ status: number; response: ArrayBuffer; finalUrl: string }>;
};

export async function fetchStatement(range: Coverage) {
  const response = await GM.xmlHttpRequest({
    method: "GET", url: downloadUrl(range), responseType: "arraybuffer", timeout: 30000
  });
  if (response.status !== 200 || response.finalUrl?.split("?")[0] !== downloadPath) {
    throw new Error("円貨入出金明細を開いてログイン状態を確認してください。");
  }
  return readStatement(decodeCsv(response.response), range);
}

export async function fetchBalances(): Promise<unknown> {
  const response = await fetch("/account/api/assets/valuations", {
    credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("My資産を開いてログイン状態を確認してください。");
  }
  return response.json();
}
