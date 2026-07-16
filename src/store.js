import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'guilds.json');

export const DEFAULT_SYSTEM_ID = 'DiceBot';

const settings = new Map();

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    for (const [guildId, entry] of Object.entries(raw)) {
      settings.set(guildId, entry);
    }
  } catch (err) {
    console.error(`設定ファイルの読み込みに失敗しました: ${DATA_FILE}`, err);
  }
}

function save() {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(settings), null, 2));
  renameSync(tmp, DATA_FILE);
}

/** サーバーに登録されているダイスシステムIDを返す(未登録なら既定値) */
export function getSystemId(guildId) {
  return settings.get(guildId)?.systemId ?? DEFAULT_SYSTEM_ID;
}

/** サーバーにダイスシステムを登録する */
export function setSystemId(guildId, systemId) {
  settings.set(guildId, { ...settings.get(guildId), systemId });
  save();
}

load();
