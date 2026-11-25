import type { Statement } from "./sbi.ts";

export type Installment = { cardDate: string; depositDate: string; yen: number };

// 月次の振替を照合する。休日によるずれを含め、後続の振替入金は35暦日までを候補とする。
function follows(debit: Statement, credit: Statement) {
  return debit.yen === credit.yen && debit.date < credit.date &&
    Date.parse(credit.date) - Date.parse(debit.date) <= 35 * 86400000;
}

export function reconcileInstallments(entries: Statement[]) {
  const cards = entries.filter(row => row.purpose === "card-credit");
  const transfers = entries.filter(row => row.purpose === "fund-transfer");
  const debits = transfers.filter(row => !row.incoming);
  const credits = transfers.filter(row => row.incoming);
  const matched: Installment[] = [];
  for (const debit of debits) {
    const sameDay = (row: Statement) => row.date === debit.date && row.yen === debit.yen;
    const funding = cards.filter(sameDay);
    if (funding.length !== 1 || debits.filter(sameDay).length !== 1) continue;
    const receipts = credits.filter(row => follows(debit, row));
    if (receipts.length !== 1) continue;
    const receipt = receipts[0];
    if (debits.filter(row => follows(row, receipt)).length !== 1) continue;

    // 同日のカード入金と振替出金は相殺される。後日の振替入金で外部入金を一度だけ計上する。
    funding[0].kind = "internal";
    debit.kind = "internal";
    debit.defaulted = false;
    receipt.kind = "deposit";
    receipt.defaulted = false;
    matched.push({ cardDate: debit.date, depositDate: receipt.date, yen: receipt.yen });
  }
  matched.sort((a, b) => b.depositDate.localeCompare(a.depositDate));
  return { matched, unmatchedTransfers: transfers.length - matched.length * 2 };
}
