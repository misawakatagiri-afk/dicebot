import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'guilds.json');

export const DEFAULT_SYSTEM_ID = 'DiceBot';

// { [guildId]: { systemId, channels: { [channelId]: systemId }, tables: { [name]: text } } }
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

function entry(guildId) {
  return settings.get(guildId) ?? {};
}

function update(guildId, patch) {
  settings.set(guildId, { ...entry(guildId), ...patch });
  save();
}

/** サーバー全体のダイスシステムIDを返す(未登録なら既定値) */
export function getGuildSystemId(guildId) {
  return entry(guildId).systemId ?? DEFAULT_SYSTEM_ID;
}

/**
 * チャンネル(スレッド→親チャンネルの順)→サーバー→既定値 の順で
 * 実際に使うダイスシステムIDを解決する
 */
export function resolveSystemId(guildId, channelIds = []) {
  const channels = entry(guildId).channels ?? {};
  for (const channelId of channelIds) {
    if (channelId && channels[channelId]) return channels[channelId];
  }
  return getGuildSystemId(guildId);
}

/** サーバー全体のダイスシステムを登録する */
export function setGuildSystemId(guildId, systemId) {
  update(guildId, { systemId });
}

/** チャンネル/スレッドにダイスシステムを登録する */
export function setChannelSystemId(guildId, channelId, systemId) {
  const channels = { ...entry(guildId).channels, [channelId]: systemId };
  update(guildId, { channels });
}

/** チャンネル/スレッドの登録を解除する。解除できたら true */
export function clearChannelSystemId(guildId, channelId) {
  const channels = { ...entry(guildId).channels };
  if (!(channelId in channels)) return false;
  delete channels[channelId];
  update(guildId, { channels });
  return true;
}

/** チャンネル/スレッドごとの登録一覧 { channelId: systemId } */
export function getChannelOverrides(guildId) {
  return entry(guildId).channels ?? {};
}

/** サーバーに登録されたオリジナル表の一覧 { name: text } */
export function getTables(guildId) {
  return entry(guildId).tables ?? {};
}

/** オリジナル表を名前で取得する */
export function getTable(guildId, name) {
  return getTables(guildId)[name];
}

/** オリジナル表を登録(同名なら上書き)する。上書きだったら true */
export function setTable(guildId, name, text) {
  const tables = { ...entry(guildId).tables };
  const overwritten = name in tables;
  tables[name] = text;
  update(guildId, { tables });
  return overwritten;
}

/** オリジナル表を削除する。削除できたら true */
export function removeTable(guildId, name) {
  const tables = { ...entry(guildId).tables };
  if (!(name in tables)) return false;
  delete tables[name];
  update(guildId, { tables });
  return true;
}

load();
