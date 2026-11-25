// 内閣府「国民の祝日」公表分。年末年始の休業日は別途判定する。
// https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv
const holidays: Record<string, string> = {
  "2020": "0101 0113 0211 0223 0224 0320 0429 0503 0504 0505 0506 0723 0724 0810 0921 0922 1103 1123",
  "2021": "0101 0111 0211 0223 0320 0429 0503 0504 0505 0722 0723 0808 0809 0920 0923 1103 1123",
  "2022": "0101 0110 0211 0223 0321 0429 0503 0504 0505 0718 0811 0919 0923 1010 1103 1123",
  "2023": "0101 0102 0109 0211 0223 0321 0429 0503 0504 0505 0717 0811 0918 0923 1009 1103 1123",
  "2024": "0101 0108 0211 0212 0223 0320 0429 0503 0504 0505 0506 0715 0811 0812 0916 0922 0923 1014 1103 1104 1123",
  "2025": "0101 0113 0211 0223 0224 0320 0429 0503 0504 0505 0506 0721 0811 0915 0923 1013 1103 1123 1124",
  "2026": "0101 0112 0211 0223 0320 0429 0503 0504 0505 0506 0720 0811 0921 0922 0923 1012 1103 1123",
  "2027": "0101 0111 0211 0223 0321 0322 0429 0503 0504 0505 0719 0811 0920 0923 1011 1103 1123"
};

export function adjacentBusinessDay(date: string, direction: 1 | -1): string {
  const cursor = new Date(date);
  while (true) {
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    const day = cursor.toISOString().slice(0, 10);
    const list = holidays[day.slice(0, 4)];
    if (!list) throw new Error("為替の受渡日を確認できる営業日カレンダーの範囲外です。");
    const mmdd = day.slice(5).replace("-", "");
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && mmdd > "0103" && mmdd !== "1231" && !list.split(" ").includes(mmdd)) return day;
  }
}
