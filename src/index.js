import 'dotenv/config';
import { createServer } from 'node:http';
import {
  ActionRowBuilder,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  Partials,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { commands } from './commands.js';
import {
  findGameSystem,
  listGameSystems,
  loadGameSystem,
  roll,
  searchGameSystems,
  validateTable,
} from './bcdice.js';
import { rollTableCommand } from './tables.js';
import { parseMacro, runMacro } from './macros.js';
import {
  DEFAULT_SYSTEM_ID,
  clearChannelSystemId,
  getChannelOverrides,
  getGuildSystemId,
  getMacro,
  getMacros,
  getTable,
  getTables,
  removeMacro,
  removeTable,
  resolveSystemId,
  setChannelSystemId,
  setGuildSystemId,
  setMacro,
  setTable,
} from './store.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('環境変数 DISCORD_TOKEN が設定されていません。.env を確認してください。');
  process.exit(1);
}

// メッセージとして扱うダイスコマンドの最大長(暴走防止)
const MAX_COMMAND_LENGTH = 200;
// Discord のメッセージ上限
const MAX_MESSAGE_LENGTH = 2000;

const TABLE_ADD_MODAL_ID = 'table-add';
const MACRO_ADD_MODAL_ID = 'macro-add';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // DM を受け取るために必要
});

function truncate(text, limit = MAX_MESSAGE_LENGTH) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function formatResult(result) {
  return truncate(`🎲 ${result.text}`);
}

/** オリジナル表の結果を整形する(複数回のときは各行に🎲を付けて空行で区切る) */
function formatTableRolls(results) {
  if (results.length === 1) return truncate(`🎲 ${results[0]}`);
  return truncate(results.map((text, i) => `🎲 #${i + 1} ${text}`).join('\n\n'));
}

/** スレッドなら [スレッドID, 親チャンネルID]、通常チャンネルなら [チャンネルID] を返す */
function channelIdsOf(channel) {
  if (!channel) return [];
  if (channel.isThread?.()) return [channel.id, channel.parentId];
  return [channel.id];
}

client.once(Events.ClientReady, async (c) => {
  console.log(`ログインしました: ${c.user.tag}`);
  await c.application.commands.set(commands);
  console.log(`スラッシュコマンドを登録しました (${commands.length} 件)`);
});

// メッセージをオリジナル表の名前 or ダイスコマンドとして評価する
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const command = message.content.split('\n', 1)[0].trim();
  if (!command || command.length > MAX_COMMAND_LENGTH) return;

  try {
    // 1. オリジナル表(「表名」「表名x3」「x3 表名」の形式に対応)
    const tableRoll = rollTableCommand(message.guildId, command);
    if (tableRoll) {
      await message.reply(formatTableRolls(tableRoll));
      return;
    }

    const systemId = resolveSystemId(message.guildId, channelIdsOf(message.channel));

    // 2. マクロ(名前が一致したら複数のダイスをまとめて振る)
    const macroText = getMacro(message.guildId, command);
    if (macroText) {
      const entries = parseMacro(macroText);
      const macroResult = entries && (await runMacro(message.guildId, systemId, entries));
      if (macroResult) {
        await message.reply(truncate(`🎲 **${command}**\n${macroResult.join('\n')}`));
        return;
      }
    }

    // 3. ダイスシステムのコマンド
    const result = await roll(systemId, command);
    if (!result) return; // ダイスコマンドではない普通のメッセージ

    if (result.secret) {
      // シークレットダイス: 結果は本人の DM にだけ送る
      await message.author.send(formatResult(result));
      if (message.guildId) {
        await message.reply('🎲 シークレットダイス(結果はDMに送りました)');
      }
    } else {
      await message.reply(formatResult(result));
    }
  } catch (err) {
    console.error(`ダイス処理に失敗しました (command=${command})`, err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId === TABLE_ADD_MODAL_ID) {
      await handleTableAddModal(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId === MACRO_ADD_MODAL_ID) {
      await handleMacroAddModal(interaction);
    }
  } catch (err) {
    console.error('インタラクションの処理に失敗しました', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
});

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  let choices;
  if (focused.name === 'system') {
    const matches = focused.value ? searchGameSystems(focused.value) : listGameSystems();
    choices = matches.map((s) => ({ name: truncate(`${s.name} (${s.id})`, 100), value: s.id }));
  } else {
    // オリジナル表またはマクロの名前
    const source =
      interaction.commandName === 'macro'
        ? getMacros(interaction.guildId)
        : getTables(interaction.guildId);
    const q = focused.value.toLowerCase();
    choices = Object.keys(source)
      .filter((name) => name.toLowerCase().includes(q))
      .map((name) => ({ name: truncate(name, 100), value: name }));
  }
  await interaction.respond(choices.slice(0, 25));
}

async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case 'system':
      await handleSystemCommand(interaction);
      break;
    case 'table':
      await handleTableCommand(interaction);
      break;
    case 'macro':
      await handleMacroCommand(interaction);
      break;
    case 'roll':
      await handleRollCommand(interaction);
      break;
    case 'dicehelp':
      await handleHelpCommand(interaction);
      break;
  }
}

async function requireGuild(interaction) {
  if (interaction.inGuild()) return true;
  await interaction.reply({
    content: 'このコマンドはサーバー内でのみ使用できます。',
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

async function handleSystemCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    if (!(await requireGuild(interaction))) return;
    const input = interaction.options.getString('system', true);
    const scope = interaction.options.getString('scope') ?? 'guild';
    // ID 完全一致 → 名前完全一致 → 部分一致(一意なら採用)の順で解決する
    const system =
      findGameSystem(input) ??
      listGameSystems().find((s) => s.name === input) ??
      (() => {
        const matches = searchGameSystems(input);
        return matches.length === 1 ? matches[0] : null;
      })();
    if (!system) {
      await interaction.reply({
        content: `ダイスシステム「${input}」が見つかりません。\`/system search\` で検索できます。`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await loadGameSystem(system.id); // 登録時にロードして動作確認を兼ねる
    if (scope === 'channel') {
      setChannelSystemId(interaction.guildId, interaction.channelId, system.id);
      await interaction.reply(
        `<#${interaction.channelId}> のダイスシステムを **${system.name}** (\`${system.id}\`) に設定しました。`,
      );
    } else {
      setGuildSystemId(interaction.guildId, system.id);
      await interaction.reply(
        `このサーバーのダイスシステムを **${system.name}** (\`${system.id}\`) に設定しました。`,
      );
    }
    return;
  }

  if (sub === 'unset') {
    if (!(await requireGuild(interaction))) return;
    const cleared = clearChannelSystemId(interaction.guildId, interaction.channelId);
    if (cleared) {
      const guildSystem = findGameSystem(getGuildSystemId(interaction.guildId));
      await interaction.reply(
        `<#${interaction.channelId}> の登録を解除しました。サーバー設定の **${guildSystem?.name ?? DEFAULT_SYSTEM_ID}** が使われます。`,
      );
    } else {
      await interaction.reply({
        content: 'このチャンネル/スレッドにはダイスシステムが登録されていません。',
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (sub === 'show') {
    const channelIds = channelIdsOf(interaction.channel);
    const resolvedId = resolveSystemId(interaction.guildId, channelIds);
    const resolved = findGameSystem(resolvedId);
    const lines = [`このチャンネルでのダイスシステム: **${resolved?.name ?? resolvedId}** (\`${resolvedId}\`)`];
    if (interaction.inGuild()) {
      const guildId = getGuildSystemId(interaction.guildId);
      lines.push(`サーバー全体の設定: ${findGameSystem(guildId)?.name ?? guildId} (\`${guildId}\`)`);
      const overrides = Object.entries(getChannelOverrides(interaction.guildId));
      if (overrides.length > 0) {
        lines.push('チャンネル/スレッドごとの登録:');
        for (const [channelId, systemId] of overrides.slice(0, 20)) {
          lines.push(`- <#${channelId}>: ${findGameSystem(systemId)?.name ?? systemId} (\`${systemId}\`)`);
        }
        if (overrides.length > 20) lines.push(`…ほか ${overrides.length - 20} 件`);
      }
    }
    await interaction.reply({ content: truncate(lines.join('\n')), flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'search') {
    const keyword = interaction.options.getString('keyword', true);
    const matches = searchGameSystems(keyword);
    if (matches.length === 0) {
      await interaction.reply({
        content: `「${keyword}」に一致するダイスシステムはありません。`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const lines = matches.slice(0, 20).map((s) => `- ${s.name} (\`${s.id}\`)`);
    if (matches.length > 20) lines.push(`…ほか ${matches.length - 20} 件`);
    await interaction.reply({
      content: truncate(`「${keyword}」の検索結果 (${matches.length} 件):\n${lines.join('\n')}`),
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleTableCommand(interaction) {
  if (!(await requireGuild(interaction))) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const modal = new ModalBuilder()
      .setCustomId(TABLE_ADD_MODAL_ID)
      .setTitle('オリジナル表の登録')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('表の名前(この名前を入力すると振れます)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('トレジャードロップ表')
            .setMaxLength(50)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('dice')
            .setLabel('振るダイス(例: 1D6, 2D6, 1D100)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1D6')
            .setMaxLength(20)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('items')
            .setLabel('表の内容(1行ごとに「出目:結果」)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('1:金貨100枚\n2:ポーション\n3:古びた剣\n4:魔法の巻物\n5:宝石\n6:何もなし')
            .setMaxLength(4000)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  if (sub === 'upload') {
    const attachment = interaction.options.getAttachment('file', true);
    if (attachment.size > 200 * 1024) {
      await interaction.reply({
        content: 'ファイルが大きすぎます(上限200KB)。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply();
    const res = await fetch(attachment.url);
    if (!res.ok) {
      await interaction.editReply('ファイルの取得に失敗しました。もう一度お試しください。');
      return;
    }
    let text = (await res.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    const customName = interaction.options.getString('name')?.trim();
    let lines = text.split('\n');
    if (customName) {
      // 呼び出し名の指定があればファイル1行目の名前を差し替える
      lines = [customName, ...lines.slice(1)];
      text = lines.join('\n');
    }
    const name = lines[0]?.trim();
    if (!name || name.length > 50 || lines.length < 3 || !validateTable(text)) {
      await interaction.editReply(
        [
          'ファイルの書式が正しくありません。次の形式のテキストファイルにしてください:',
          '```',
          '表の名前(50文字以内)',
          '1D100',
          '1:結果その1',
          '2:結果その2',
          '…(ダイスで出うるすべての出目の行)',
          '```',
        ].join('\n'),
      );
      return;
    }
    const overwritten = setTable(interaction.guildId, name, text);
    await interaction.editReply(
      `オリジナル表「**${name}**」(${lines[1].trim()}、${lines.length - 2}項目) を${overwritten ? '更新' : '登録'}しました。「${name}」とメッセージを送ると振れます。`,
    );
    return;
  }

  if (sub === 'list') {
    const names = Object.keys(getTables(interaction.guildId));
    if (names.length === 0) {
      await interaction.reply({
        content: 'オリジナル表はまだ登録されていません。`/table add` で作成できます。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: truncate(
        `登録されているオリジナル表 (${names.length} 件):\n${names.map((n) => `- ${n}`).join('\n')}\n表の名前をメッセージで送ると振れます。`,
      ),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'show') {
    const name = interaction.options.getString('name', true);
    const text = getTable(interaction.guildId, name);
    if (!text) {
      await interaction.reply({
        content: `オリジナル表「${name}」は登録されていません。`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: truncate(`\`\`\`\n${text}\n\`\`\``),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'remove') {
    const name = interaction.options.getString('name', true);
    const removed = removeTable(interaction.guildId, name);
    await interaction.reply(
      removed
        ? `オリジナル表「${name}」を削除しました。`
        : { content: `オリジナル表「${name}」は登録されていません。`, flags: MessageFlags.Ephemeral },
    );
  }
}

async function handleTableAddModal(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const dice = interaction.fields.getTextInputValue('dice').trim();
  const items = interaction.fields.getTextInputValue('items').trim();
  const text = `${name}\n${dice}\n${items}`;

  if (!validateTable(text)) {
    await interaction.reply({
      content: [
        '表の書式が正しくありません。次を確認してください:',
        '- ダイスは `1D6` `2D6` のような形式か',
        '- 内容の各行が `出目:結果`(例: `1:金貨100枚`)になっているか',
        '- ダイスで出うるすべての出目に行があるか',
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const overwritten = setTable(interaction.guildId, name, text);
  await interaction.reply(
    `オリジナル表「**${name}**」(${dice}) を${overwritten ? '更新' : '登録'}しました。「${name}」とメッセージを送ると振れます。`,
  );
}

async function handleMacroCommand(interaction) {
  if (!(await requireGuild(interaction))) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const modal = new ModalBuilder()
      .setCustomId(MACRO_ADD_MODAL_ID)
      .setTitle('マクロの登録')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('マクロの名前(この名前を入力すると実行されます)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('サイオン')
            .setMaxLength(50)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('lines')
            .setLabel('内容(1行ごとに「ラベル:コマンド:最低値」最低値は省略可)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('肉体:2D10+25:35\n精神:2D10+10:20\n環境:2D10+10:20')
            .setMaxLength(1500)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  if (sub === 'list') {
    const names = Object.keys(getMacros(interaction.guildId));
    if (names.length === 0) {
      await interaction.reply({
        content: 'マクロはまだ登録されていません。`/macro add` で作成できます。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: truncate(
        `登録されているマクロ (${names.length} 件):\n${names.map((n) => `- ${n}`).join('\n')}\nマクロの名前をメッセージで送ると実行されます。`,
      ),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'show') {
    const name = interaction.options.getString('name', true);
    const text = getMacro(interaction.guildId, name);
    if (!text) {
      await interaction.reply({
        content: `マクロ「${name}」は登録されていません。`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: truncate(`**${name}**\n\`\`\`\n${text}\n\`\`\``),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'remove') {
    const name = interaction.options.getString('name', true);
    const removed = removeMacro(interaction.guildId, name);
    await interaction.reply(
      removed
        ? `マクロ「${name}」を削除しました。`
        : { content: `マクロ「${name}」は登録されていません。`, flags: MessageFlags.Ephemeral },
    );
  }
}

async function handleMacroAddModal(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const linesText = interaction.fields.getTextInputValue('lines').trim();

  const entries = parseMacro(linesText);
  if (!entries) {
    await interaction.reply({
      content: [
        'マクロの書式が正しくありません。1行ごとに次の形式で書いてください:',
        '```',
        'ラベル:ダイスコマンド:最低値',
        '例) 肉体:2D10+25:35',
        '例) 精神:2D10+10      ← 最低値は省略可',
        '```',
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 各コマンドが実際に振れるか確認してから登録する
  const test = await runMacro(interaction.guildId, DEFAULT_SYSTEM_ID, entries);
  if (!test) {
    await interaction.reply({
      content:
        'ダイスコマンドとして解釈できない行があります。コマンド部分(例: 2D10+25)を確認してください。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const overwritten = setMacro(interaction.guildId, name, linesText);
  await interaction.reply(
    `マクロ「**${name}**」(${entries.length}行) を${overwritten ? '更新' : '登録'}しました。「${name}」とメッセージを送ると実行されます。`,
  );
}

async function handleRollCommand(interaction) {
  const command = interaction.options.getString('command', true).trim();

  // オリジナル表の名前(繰り返し指定つきも可)が指定されたらそれを振る
  const tableRoll = rollTableCommand(interaction.guildId, command);
  if (tableRoll) {
    await interaction.reply(formatTableRolls(tableRoll));
    return;
  }

  const systemId = resolveSystemId(interaction.guildId, channelIdsOf(interaction.channel));

  // マクロ名が指定されたらまとめて振る
  const macroText = getMacro(interaction.guildId, command);
  if (macroText) {
    const entries = parseMacro(macroText);
    const macroResult = entries && (await runMacro(interaction.guildId, systemId, entries));
    if (macroResult) {
      await interaction.reply(truncate(`🎲 **${command}**\n${macroResult.join('\n')}`));
      return;
    }
  }
  const result = await roll(systemId, command);
  if (!result) {
    await interaction.reply({
      content: `「${command}」はダイスコマンドとして解釈できませんでした。\`/dicehelp\` でコマンド一覧を確認できます。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    content: formatResult(result),
    flags: result.secret ? MessageFlags.Ephemeral : undefined,
  });
}

async function handleHelpCommand(interaction) {
  const systemId = resolveSystemId(interaction.guildId, channelIdsOf(interaction.channel));
  const GameSystem = await loadGameSystem(systemId);
  const system = findGameSystem(systemId);
  const lines = [
    `**${system?.name ?? systemId}** (\`${systemId}\`) のコマンド:`,
    '```',
    GameSystem.HELP_MESSAGE.trim(),
    '```',
    `※ ${DEFAULT_SYSTEM_ID} 共通のコマンド(2d6 や 1d100+5 など)もいつでも使えます。`,
  ];
  const tableNames = Object.keys(getTables(interaction.guildId));
  if (tableNames.length > 0) {
    lines.push(`※ オリジナル表: ${tableNames.map((n) => `「${n}」`).join(' ')}(名前を送ると振れます)`);
  }
  await interaction.reply({ content: truncate(lines.join('\n')), flags: MessageFlags.Ephemeral });
}

client.login(token);

// PaaS(Koyeb など)のヘルスチェック用: PORT が設定されているときだけ HTTP で応答する
const port = process.env.PORT;
if (port) {
  createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  }).listen(port, () => console.log(`ヘルスチェックサーバーを起動しました (port ${port})`));
}
