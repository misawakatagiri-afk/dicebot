# dicebot

BCDice を使った Discord 用 TRPG ダイスボットです。

- チャンネルにメッセージを入力するだけでダイスを振れます(例: `2d6`、`CC<=54`、`S1d100`)
- ダイスエンジンには [BCDice](https://bcdice.org/)(の JavaScript 移植版 [bcdice-js](https://github.com/bcdice/bcdice-js))を使用。約300のゲームシステムに対応
- サーバー(ギルド)ごとに好きなダイスシステムを登録して切り替えられます

## 使い方

### メッセージでダイスを振る

チャンネルにダイスコマンドをそのまま入力すると、ボットが結果を返信します。
ダイスコマンドとして解釈できないメッセージは無視されるので、普段の会話の邪魔をしません。

```
2d6+3
🎲 (2D6+3) ＞ 7[3,4]+3 ＞ 10
```

`S` を付けたシークレットダイス(例: `S1d100`)の結果は、本人の DM にだけ送られます。

### スラッシュコマンド

| コマンド | 説明 |
| --- | --- |
| `/system set <system>` | このサーバーで使うダイスシステムを登録(入力すると候補が表示されます) |
| `/system show` | 現在登録されているダイスシステムを表示 |
| `/system search <keyword>` | 利用できるダイスシステムを検索 |
| `/roll <command>` | ダイスを振る(メッセージの代わりに明示的に振りたいとき) |
| `/dicehelp` | 現在のダイスシステムのコマンド一覧を表示 |

例: `/system set クトゥルフ` と入力すると候補から「新クトゥルフ神話TRPG (Cthulhu7th)」などを選べます。
登録後は `CC<=54` のようなシステム固有のコマンドが使えるようになります。
未登録のサーバーでは標準ダイス(`DiceBot`)が使われます。

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

サーバーごとの設定は `data/guilds.json` に保存されます。

## 開発

```
src/
  index.js     # ボット本体(メッセージ・スラッシュコマンドの処理)
  bcdice.js    # BCDice のロード・評価まわり
  commands.js  # スラッシュコマンド定義
  store.js     # サーバーごとの設定の永続化
```
