import type { Point } from "./analytics.ts";

type Series = { key: "value" | "baseline" | "profit" | "adjustedValue"; label: string; color: string };
export const series: Series[] = [
  { key: "value", label: "資産評価額", color: "#12518d" },
  { key: "baseline", label: "入出金調整後の基準額", color: "#ab5824" },
  { key: "profit", label: "累積運用損益", color: "#00765c" },
  { key: "adjustedValue", label: "入出金を除いた資産額", color: "#7039a3" }
];

export function chart(points: Point[], lines: Series[]) {
  const figure = document.createElement("figure");
  const caption = document.createElement("figcaption");
  for (const line of lines) {
    const label = document.createElement("span");
    label.textContent = line.label;
    label.style.borderColor = line.color;
    caption.append(label);
  }
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", lines.map(line => line.label).join("、") + "の時系列。数値は下の日別明細を参照。");
  canvas.setAttribute("role", "img");
  figure.append(caption, canvas);
  const width = 760, height = 210;
  canvas.width = width * 2;
  canvas.height = height * 2;
  const g = canvas.getContext("2d");
  if (!g || !points.length) return figure;
  g.scale(2, 2);
  let min = Infinity, max = -Infinity;
  for (const point of points) {
    for (const { key } of lines) {
      const n = point[key];
      if (n !== null) { min = Math.min(min, n); max = Math.max(max, n); }
    }
  }
  if (!Number.isFinite(min)) {
    g.fillText("算出可能な評価点がありません", 15, 40);
    return figure;
  }
  if (min === max) { min -= 1; max += 1; }
  const left = 105, right = width - 25;
  const top = 18, bottom = height - 29;
  const first = Date.parse(points[0].date), last = Date.parse(points[points.length - 1].date);
  const x = (date: string) => first === last ? (left + right) / 2 :
    left + (Date.parse(date) - first) / (last - first) * (right - left);
  const y = (yen: number) => bottom - (yen - min) / (max - min) * (bottom - top);
  g.font = "13px sans-serif";
  g.fillStyle = "#374151";
  g.textAlign = "right";
  for (const tick of [min, (min + max) / 2, max]) {
    g.fillText(Math.round(tick).toLocaleString("ja-JP") + " 円", left - 8, y(tick) + 4);
    g.strokeStyle = "#d9dfe3";
    g.beginPath(); g.moveTo(left, y(tick)); g.lineTo(right, y(tick)); g.stroke();
  }
  g.textAlign = "left";
  g.fillText(points[0].date, left, height - 6);
  if (last !== first) {
    g.textAlign = "right";
    g.fillText(points[points.length - 1].date, right, height - 6);
  }
  for (const line of lines) {
    g.strokeStyle = g.fillStyle = line.color;
    g.lineWidth = 2;
    g.beginPath();
    let contiguous = false;
    for (const point of points) {
      const value = point[line.key];
      if (value === null) { contiguous = false; continue; }
      if (contiguous) g.lineTo(x(point.date), y(value));
      else g.moveTo(x(point.date), y(value));
      contiguous = true;
    }
    g.stroke();
    for (const point of points) {
      const value = point[line.key];
      if (value === null) continue;
      g.beginPath(); g.arc(x(point.date), y(value), 3, 0, 2 * Math.PI); g.fill();
    }
  }
  return figure;
}
