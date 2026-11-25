# SBI My Assets Plus

SBI証券のMy資産に、外部入出金を差し引いた運用損益を表示するためのUserScript。現在は架空の週次評価額とテスト用CSVで、集計とグラフを試せる開発版です。実口座向けの初回リリースは、資産推移の応答形式と円貨入出金明細の仕様を確認してから行います。

## ローカルで試す

開発環境はNode.js 26とpnpm 12です。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

`dist/sbi-my-assets-plus-preview.html` をFirefoxまたはGoogle Chromeで開くと、架空の評価額と資金移動から計算した結果が表示されます。最終日の累計純入金額は150,000円、累積運用損益は30,800円です。「テスト明細CSVを保存」から取得したファイルの摘要を未知の値に変え、再選択して「更新」を押すと、その取引以降の損益が保留になることも確認できます。

Windows 11でビルド後に `node scripts/check-preview.mjs` を実行すると、インストール済みのChromeとFirefoxを一時プロファイルで開き、グラフ表示とCSV再取込を検証します。標準以外の場所にある場合は `CHROME_PATH` と `FIREFOX_PATH` に実行ファイルのパスを指定してください。

ビルド成果物は `dist/sbi-my-assets-plus.user.js` です。開発版をTampermonkeyに入れ、My資産の `https://site.sbisec.co.jp/account/assets` を再読み込みすると、ページ下部の「運用成績（UserScript）」で保存済みの評価額JSONを選べます。ローカルプレビューでも同じJSONを選択できます。「日別明細」の評価日と金額を公式グラフの同じ日と照合してください。実際の評価額に対する入出金調整は明細の分類が確定するまで保留します。GitHub Releasesからの配布要件は[実装計画](./doc/implementation-plan.md)に記載しています。
