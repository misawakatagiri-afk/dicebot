import bcdice from 'bcdice';

const { DynamicLoader } = bcdice;

const loader = new DynamicLoader();
const cache = new Map();

/** 利用可能な全ゲームシステムの一覧(id, name, sortKey など) */
export function listGameSystems() {
  return loader.listAvailableGameSystems();
}

/** id からゲームシステム情報を引く */
export function findGameSystem(id) {
  return listGameSystems().find((s) => s.id === id);
}

/** キーワードで名前・IDを部分一致検索する */
export function searchGameSystems(keyword) {
  const q = keyword.toLowerCase();
  return listGameSystems().filter(
    (s) =>
      s.id.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.sortKey ?? '').toLowerCase().includes(q),
  );
}

/** ゲームシステムのクラスをロードする(ロード済みはキャッシュから返す) */
export async function loadGameSystem(id) {
  if (cache.has(id)) return cache.get(id);
  const GameSystem = await loader.dynamicLoad(id);
  cache.set(id, GameSystem);
  return GameSystem;
}

/**
 * テキストをダイスコマンドとして評価する。
 * コマンドとして解釈できなければ null を返す。
 */
export async function roll(systemId, command) {
  const GameSystem = await loadGameSystem(systemId);
  // COMMAND_PATTERN で軽く前置きフィルタしてから eval する
  if (GameSystem.COMMAND_PATTERN && !GameSystem.COMMAND_PATTERN.test(command)) {
    return null;
  }
  return GameSystem.eval(command);
}
