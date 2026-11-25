# SBI My Assets Plus

SBI証券のMy資産に、外部入出金を差し引いた運用損益を表示するためのUserScript。My資産の「更新」で資産評価額と指定期間の円貨入出金明細をSBI証券から読み取り、「入出金を除いた資産額」をグラフに表示します。

## ローカルで試す

開発環境はNode.js 26とpnpm 12です。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

`dist/sbi-my-assets-plus-preview.html` をFirefoxまたはGoogle Chromeで開くと、架空の評価額と資金移動から計算した結果が表示されます。最終日の累計純入金額は150,000円、累積運用損益は30,800円です。「テスト明細CSVを保存」から取得したファイルの摘要を未知の値に変え、再選択して「更新」を押すと、その取引以降の損益が保留になることも確認できます。

Windows 11でビルド後に `node scripts/check-preview.mjs` を実行すると、インストール済みのChromeとFirefoxを一時プロファイルで開き、グラフ表示とCSV再取込を検証します。標準以外の場所にある場合は `CHROME_PATH` と `FIREFOX_PATH` に実行ファイルのパスを指定してください。

ビルド成果物は `dist/sbi-my-assets-plus.user.js` です。開発版をTampermonkeyに入れ、My資産の `https://site.sbisec.co.jp/account/assets` を再読み込みすると、ページ下部の「運用成績（UserScript）」で期間を指定して「更新」できます。Tampermonkeyは円貨入出金明細の取得に `member.c.sbisec.co.jp` への接続を使います。未分類の明細がある場合は「未分類の明細を確認」で対象内の取引か外部入出金かを指定すると再計算します。分類は更新するまで有効です。現時点の入出金調整は預り金・iDeCoを含む基本系列で計算し、除外系列では評価額を表示します。GitHub Releasesからの配布要件は[実装計画](./doc/implementation-plan.md)に記載しています。
