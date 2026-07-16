import { rollTable } from './bcdice.js';
import { getTable } from './store.js';

// オリジナル表の繰り返しロールの上限(スパム防止)
const MAX_TABLE_REPEAT = 20;

/**
 * テキストをオリジナル表のコマンドとして解釈して振る。
 * 「表名」のほか「表名x3」「x3 表名」「rep3 表名」の繰り返し指定に対応。
 * 表が見つからなければ null を返す。
 */
export function rollTableCommand(guildId, command) {
  let name = command;
  let count = 1;

  // 完全一致する表名を最優先(「経歴表x3」という名前の表があればそちらが勝つ)
  if (!getTable(guildId, name)) {
    let m = command.match(/^(?:[x×]|rep|repeat)(\d+)\s+(.+)$/i);
    if (m) {
      count = Number(m[1]);
      name = m[2].trim();
    } else if ((m = command.match(/^(.+?)\s*[x×](\d+)$/i))) {
      count = Number(m[2]);
      name = m[1].trim();
    }
  }

  const text = getTable(guildId, name);
  if (!text) return null;

  count = Math.min(Math.max(count, 1), MAX_TABLE_REPEAT);
  const lines = [];
  for (let i = 0; i < count; i++) {
    const result = rollTable(text);
    if (!result) return null; // 表の書式が壊れている場合
    lines.push(count === 1 ? result.text : `#${i + 1} ${result.text}`);
  }
  return lines.join('\n');
}
