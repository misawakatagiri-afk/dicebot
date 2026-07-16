#!/usr/bin/env bash
# Oracle Cloud などの Ubuntu サーバーでダイスボットを常駐サービス化するスクリプト。
# リポジトリ直下で実行する:  sudo bash deploy/setup.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "sudo で実行してください:  sudo bash deploy/setup.sh" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# sudo 実行時の元ユーザー(ボットの実行ユーザーにする)
RUN_USER="${SUDO_USER:-ubuntu}"

echo "==> Node.js 22 をインストールします"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "    Node.js: $(node -v)"

echo "==> 依存パッケージをインストールします"
cd "$APP_DIR"
sudo -u "$RUN_USER" npm install --omit=dev

if [ ! -f "$APP_DIR/.env" ]; then
  echo "==> Discord ボットのトークンを入力してください(画面には表示されません)"
  read -rsp "DISCORD_TOKEN: " TOKEN
  echo
  if [ -z "$TOKEN" ]; then
    echo "トークンが空です。中断します。" >&2
    exit 1
  fi
  install -m 600 -o "$RUN_USER" -g "$RUN_USER" /dev/null "$APP_DIR/.env"
  echo "DISCORD_TOKEN=$TOKEN" > "$APP_DIR/.env"
  echo "    .env を作成しました"
else
  echo "==> 既存の .env を使います"
fi

echo "==> systemd サービスを登録します"
cat > /etc/systemd/system/dicebot.service <<UNIT
[Unit]
Description=Discord TRPG dice bot (BCDice)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) $APP_DIR/src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now dicebot

echo
echo "==> 完了! 状態を確認します"
sleep 3
systemctl --no-pager status dicebot || true
echo
echo "ログの確認:   journalctl -u dicebot -f"
echo "再起動:       sudo systemctl restart dicebot"
echo "停止:         sudo systemctl stop dicebot"
