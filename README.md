# SBI My Assets Plus

SBI証券のMy資産に、外部入出金を差し引いた運用損益を表示するためのUserScript。My資産の「更新」で資産評価額と指定期間の円貨入出金明細をSBI証券から読み取り、「入出金を除いた資産額」をグラフに表示します。

**[SBI My Assets Plus をインストール](https://github.com/yukihane/sbi-my-assets-plus/releases/latest/download/sbi-my-assets-plus.user.js)**

1. 初回のみ、お使いのブラウザーにTampermonkeyを追加します。[Firefox版](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/) ／ [Google Chrome版](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
2. ChromeではTampermonkeyの拡張機能の詳細で「ユーザー スクリプトを許可」をオンにします。[設定手順](https://www.tampermonkey.net/faq.php?q=Q209)
3. 上のインストールリンクを開き、Tampermonkeyの確認画面で「インストール」を押します。開発プレビュー版をお使いの場合は、Tampermonkeyのダッシュボードで旧版を無効にしてください。
4. ログインしてMy資産を開き、ページ下部の「運用成績（UserScript）」で「更新」を押します。すでに開いている場合はページを再読み込みしてください。[My資産を開く](https://site.sbisec.co.jp/account/assets)

`member.c.sbisec.co.jp` への接続許可は、円貨入出金明細の読み取りに使用します。評価額と明細はブラウザー内で集計します。スクリプトの更新先はGitHub Releasesです。

## グラフの読み方

「損益の基準日」で、照会期間内に評価額がある日を選べます。初期値の「自動」は最初の評価日です。基準日を変えると、その日の損益が0円になり、それ以降のグラフ・金額・日別明細がすぐに切り替わります。基準日当日の入出金はその日の評価額に含まれるものとして、翌日分から集計します。「自動」を選ぶと元の期間に戻ります。

**黒い実線とひし形（◆）** が「入出金を除いた資産額」です。開始時に100万円あり、その後20万円を入金して評価額が123万円になった例では、ここに103万円、開始時からの運用損益に＋3万円と表示します。

資産評価額は青の短い破線と丸（○）、基準額は濃いオレンジの長い破線と四角（□）、累積運用損益は青緑の点線と三角（△）です。各グラフの凡例には選択日の金額が円単位で出ます。初期表示は最新日です。グラフ上にポインターを合わせるかタップするか、「評価日」をキーボードで選ぶと、その日の金額を確認できます。

円貨明細に「その他」の入出金がある場合は、「更新」で為替注文履歴も取得します。口座内で円と米ドルを交換した分は、約定の受渡日・円金額・入出金方向が一対一で一致した場合に外部入出金から除外します。照合結果は画面を開いている間だけ使います。候補が重なった場合や履歴を取得できなかった場合は、その旨を表示します。

その他の用途不明の明細は、入金なら外部入金、出金なら外部出金として計算します。外部入金は評価額から引き、外部出金は足し戻します。配当や税など、運用に伴うと判定できた受払いは損益に残します。

「外部入出金として扱う明細の分類を変更」では、同じ方向・区分・摘要をまとめて純入金額から除外できます。変更は次の更新まで有効です。預り金・iDeCoを除外する設定では評価額のみを表示します。

## ローカルで試す

開発環境はNode.js 26とpnpm 12です。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

`dist/sbi-my-assets-plus-preview.html` をFirefoxまたはGoogle Chromeで開くと、架空の評価額と資金移動から計算した結果が表示されます。最終日の累計純入金額は150,000円、累積運用損益は30,800円です。

Windows 11でビルド後に `node scripts/check-preview.mjs` を実行すると、インストール済みのChromeとFirefoxを一時プロファイルで開き、グラフ表示とCSV再取込を検証します。標準以外の場所にある場合は `CHROME_PATH` と `FIREFOX_PATH` に実行ファイルのパスを指定してください。

ビルド成果物は `dist/sbi-my-assets-plus.user.js` です。データの取得範囲、入出金の分類、損益の計算式は[取得と集計の仕様](./doc/design.md)に記載しています。
