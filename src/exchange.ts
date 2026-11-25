import type { Coverage } from "./analytics.ts";
import { adjacentBusinessDay } from "./business-day.ts";
import { yen } from "./csv.ts";
import { fetchSiteJson, type Statement } from "./sbi.ts";

type Exchange = { settlement: string; incoming: boolean; yen: number };
const pageSize = 10;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function fetchExchanges(range: Coverage) {
  const start = adjacentBusinessDay(range.start, -1);
  const orders: Exchange[] = [];
  const seen = new Set<string>();
  let expected: number | undefined;
  for (let number = 1; ; number++) {
    const url = new URL("https://site.sbisec.co.jp/exchange/api/order/histories");
    url.search = new URLSearchParams({
      businessDateFrom: start, businessDateTo: range.end, pageNum: String(number), pageSize: String(pageSize)
    }).toString();
    const data = await fetchSiteJson(url.href, "為替注文履歴");
    if (!record(data) || data.message != null || !record(data.page) || !Array.isArray(data.orderDetails)) {
      throw new Error("為替注文履歴の一覧を確認できません。");
    }
    const { page, orderDetails } = data;
    const total = page.totalCount;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) throw new Error("為替注文履歴の総件数が不正です。");
    expected ??= total;
    const lastPage = number * pageSize >= total;
    if (expected !== total || page.pageNum !== number || page.pageSize !== pageSize ||
        page.firstPage !== (number === 1) || page.hasPreviousPage !== (number > 1) ||
        page.lastPage !== lastPage || page.hasNextPage !== !lastPage ||
        orderDetails.length !== Math.min(pageSize, total - (number - 1) * pageSize)) {
      throw new Error("為替注文履歴のページまたは件数が一致しません。");
    }
    for (const row of orderDetails) {
      if (!record(row) || typeof row.businessDate !== "string" || !/^\d{4}-\d\d-\d\d$/.test(row.businessDate) ||
          new Date(row.businessDate).toJSON()?.slice(0, 10) !== row.businessDate ||
          row.businessDate < start || row.businessDate > range.end ||
          typeof row.orderNo !== "string" || !row.orderNo || typeof row.orderEventId !== "string" || !row.orderEventId ||
          typeof row.currencyCode !== "string" || typeof row.exchangeOrderStatus !== "string") {
        throw new Error("為替注文履歴の日付または注文情報が不正です。");
      }
      const id = JSON.stringify([row.businessDate, row.orderNo, row.orderEventId]);
      if (seen.has(id)) throw new Error("為替注文履歴に重複した注文があります。");
      seen.add(id);
      if (row.currencyCode !== "USD" || row.exchangeOrderStatus !== "COMPLETED") continue;
      if (row.exchangeTradeType !== "REAL" || row.displayOrderStatus !== "ORDER_FINISHED" ||
          (row.buySellCode !== "BUY" && row.buySellCode !== "SELL") || typeof row.netAmount !== "string") {
        throw new Error("米ドル約定の取引種別・方向・確定金額を確認できません。");
      }
      let amount;
      try { amount = yen(row.netAmount); } catch { throw new Error("米ドル約定の円受渡金額が不正です。"); }
      if (amount === null || amount <= 0) throw new Error("米ドル約定の円受渡金額が不正です。");
      if (row.businessDate === range.end) continue; // 受渡日は範囲の後
      const settlement = adjacentBusinessDay(row.businessDate, 1);
      if (settlement >= range.start && settlement <= range.end) {
        orders.push({ settlement, incoming: row.buySellCode === "SELL", yen: amount });
      }
    }
    if (lastPage) return orders;
  }
}

export function exchangeCandidate(row: Statement) {
  return row.defaulted && row.description.startsWith("その他／");
}

export function markUnverified(rows: Statement[]) {
  for (const row of rows) { row.kind = "unknown"; row.defaulted = false; }
}

export function reconcileExchanges(entries: Statement[], orders: Exchange[]) {
  const groups = new Map<string, { count: number; rows: Statement[] }>();
  const key = (date: string, incoming: boolean, amount: number) => [date, incoming, amount].join("/");
  for (const order of orders) {
    const id = key(order.settlement, order.incoming, order.yen);
    const group = groups.get(id) ?? { count: 0, rows: [] };
    group.count++;
    groups.set(id, group);
  }
  for (const row of entries) {
    if (exchangeCandidate(row)) groups.get(key(row.date, row.incoming, row.yen))?.rows.push(row);
  }
  let matched = 0, unresolved = 0;
  for (const { count, rows } of groups.values()) {
    if (count === 1 && rows.length === 1) {
      rows[0].kind = "internal";
      rows[0].defaulted = false;
      matched++;
    } else {
      unresolved += count;
      markUnverified(rows);
    }
  }
  return { matched, unresolved };
}
