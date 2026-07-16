# dicebot

BCDice を使った Discord 用 TRPG ダイスボットです。

- チャンネルにメッセージを入力するだけでダイスを振れます(例: `2d6`、`CC<=54`、`S1d100`)
- ダイスエンジンには [BCDice](https://bcdice.org/)(の JavaScript 移植版 [bcdice-js](https://github.com/bcdice/bcdice-js))を使用。約300のゲームシステムに対応
- サーバー・チャンネル・スレッドごとに好きなダイスシステムを登録して切り替えられます
- 「トレジャードロップ表」のようなオリジナルのランダム表を作成・登録できます

## 使い方

### メッセージでダイスを振る

チャンネルにダイスコマンドをそのまま入力すると、ボットが結果を返信します。
ダイスコマンドとして解釈できないメッセージは無視されるので、普段の会話の邪魔をしません。

```
2d6+3
🎲 (2D6+3) ＞ 7[3,4]+3 ＞ 10
```

`S` を付けたシークレットダイス(例: `S1d100`)の結果は、本人の DM にだけ送られます。

### ダイスシステムの登録

`/system set` で使うシステムを登録します。登録範囲は2種類あります。

- **サーバー全体**(既定): サーバーの標準システムになります
- **このチャンネル/スレッドのみ**: 卓ごとにチャンネルを分けている場合に便利です

システムは「スレッド → 親チャンネル → サーバー全体 → 標準ダイス」の順で解決されるので、
例えば「#クトゥルフ卓」ではクトゥルフ、「#SW卓」ではソードワールドのコマンドが使える、
という運用ができます。`2d6+3` などの共通コマンドはどのシステムでも常に使えます。

### オリジナルのランダム表

`/table add` で入力フォームが開き、任意の表を作成・登録できます。

```
表の名前: トレジャードロップ表
振るダイス: 1D6
表の内容:
1:金貨100枚
2:ポーション
3:古びた剣
4:魔法の巻物
5:宝石
6:何もなし
```

登録後は、表の名前(`トレジャードロップ表`)をメッセージで送るだけで振れます。

```
トレジャードロップ表
🎲 トレジャードロップ表(4) ＞ 魔法の巻物
```

### スラッシュコマンド一覧

| コマンド | 説明 |
| --- | --- |
| `/system set <system> [scope]` | ダイスシステムを登録(サーバー全体 or このチャンネル/スレッド) |
| `/system unset` | このチャンネル/スレッドの登録を解除してサーバー設定に戻す |
| `/system show` | 現在の設定(チャンネルごとの登録一覧を含む)を表示 |
| `/system search <keyword>` | 利用できるダイスシステムを検索 |
| `/table add` | オリジナル表を作成・登録(フォームが開きます) |
| `/table list` | 登録されたオリジナル表の一覧 |
| `/table show <name>` | オリジナル表の内容を表示 |
| `/table remove <name>` | オリジナル表を削除 |
| `/roll <command>` | ダイスを振る(オリジナル表の名前も指定可) |
| `/dicehelp` | 現在のダイスシステムのコマンド一覧を表示 |

## セットアップ

### 1. Discord ボットを作成する

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成
2. **Bot** タブでボットを作成し、トークンをコピー
3. **Bot** タブの *Privileged Gateway Intents* で **MESSAGE CONTENT INTENT** を有効化(メッセージでダイスを振るために必須)
4. **OAuth2 → URL Generator** で `bot` と `applications.commands` スコープを選び、
   *Send Messages* / *Read Message History* 権限を付けた招待 URL でサーバーに追加

### 2. ボットを起動する

```sh
npm install
cp .env.example .env   # DISCORD_TOKEN にボットのトークンを設定
npm start
```

サーバーごとの設定(システム登録・オリジナル表)は `data/guilds.json` に保存されます。

### 3. クラウドで常時稼働させる(Oracle Cloud 無料枠の例)

自分のマシンを常時稼働させたくない場合は、[Oracle Cloud Always Free](https://www.oracle.com/jp/cloud/free/) の
無料VM(Ubuntu)で動かせます。VMにSSHでログインして次を実行します:

```sh
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/misawakatagiri-afk/dicebot.git
cd dicebot
sudo bash deploy/setup.sh   # Node.jsインストール→トークン入力→常駐サービス化まで自動
```

スクリプトが Node.js のインストール、依存パッケージの導入、トークンの設定(`.env`)、
systemd による常駐化(自動起動・異常時の自動再起動)まで行います。

- ログ確認: `journalctl -u dicebot -f`
- 再起動: `sudo systemctl restart dicebot`

なお、コンテナ型PaaSにデプロイする場合に備えて、`PORT` 環境変数が設定されているときだけ
ヘルスチェック用のHTTPサーバーが自動起動するようになっています(VPS/VMでは不要なので起動しません)。
コンテナ型PaaSでは再デプロイ時に `data/guilds.json`(システム登録・オリジナル表)が
初期化される点に注意してください。VM運用ならこの問題はありません。

## 開発

```
src/
  index.js     # ボット本体(メッセージ・スラッシュコマンド・モーダルの処理)
  bcdice.js    # BCDice のロード・評価・オリジナル表まわり
  commands.js  # スラッシュコマンド定義
  store.js     # サーバー/チャンネルごとの設定・表の永続化
```
