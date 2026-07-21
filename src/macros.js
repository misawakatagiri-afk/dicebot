import { roll } from './bcdice.js';
import { rollTableCommand } from './tables.js';

/**
 * マクロ定義のテキストを解析する。
 * 各行は「ラベル:ダイスコマンド」または「ラベル:ダイスコマンド:最低値」。
 * 区切りのコロンは半角・全角どちらでもよく、最低値には「最低」の接頭辞を付けてもよい。
 * 書式が不正なら null を返す。
 */
export function parseMacro(text) {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const entries = [];
  for (const line of lines) {
    const parts = line.split(/[:：]/).map((p) => p.trim());
    if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) return null;
    let min = null;
    if (parts.length === 3) {
      min = Number(parts[2].replace(/^最低/, ''));
      if (!Number.isFinite(min)) return null;
    }
    entries.push({ label: parts[0], command: parts[1], min });
  }
  return entries;
}

/**
 * マクロを実行して結果行の配列を返す。
 * コマンド部分にはBCDiceのダイスコマンドのほか、登録済みオリジナル表の名前
 * (「x2 表名」の繰り返し指定つきも可)を書ける。
 * 合計値が最低値を下回った場合は最低値に切り上げた旨を表示する。
 * いずれかの行が評価できなければ null を返す。
 */
export async function runMacro(guildId, systemId, entries) {
  const lines = [];
  for (const entry of entries) {
    // オリジナル表の名前ならそれを振る
    const tableResults = rollTableCommand(guildId, entry.command);
    if (tableResults) {
      if (tableResults.length === 1) {
        lines.push(`${entry.label}: ${tableResults[0]}`);
      } else {
        tableResults.forEach((text, i) => lines.push(`${entry.label} #${i + 1}: ${text}`));
      }
      continue;
    }

    const result = await roll(systemId, entry.command);
    if (!result) return null;
    let text = result.text;
    if (entry.min != null) {
      const m = text.match(/＞\s*(-?\d+)\s*$/);
      if (m && Number(m[1]) < entry.min) {
        text += ` ＞ 最低値${entry.min}を適用 ＞ ${entry.min}`;
      }
    }
    lines.push(`${entry.label}: ${text}`);
  }
  return lines;
}
