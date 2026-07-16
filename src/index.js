import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
} from 'discord.js';
import { commands } from './commands.js';
import {
  findGameSystem,
  listGameSystems,
  loadGameSystem,
  roll,
  searchGameSystems,
} from './bcdice.js';
import { DEFAULT_SYSTEM_ID, getSystemId, setSystemId } from './store.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('環境変数 DISCORD_TOKEN が設定されていません。.env を確認してください。');
  process.exit(1);
}

// メッセージとして扱うダイスコマンドの最大長(暴走防止)
const MAX_COMMAND_LENGTH = 200;
// Discord のメッセージ上限
const MAX_MESSAGE_LENGTH = 2000;

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

client.once(Events.ClientReady, async (c) => {
  console.log(`ログインしました: ${c.user.tag}`);
  await c.application.commands.set(commands);
  console.log(`スラッシュコマンドを登録しました (${commands.length} 件)`);
});

// メッセージをそのままダイスコマンドとして評価する
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const command = message.content.split('\n', 1)[0].trim();
  if (!command || command.length > MAX_COMMAND_LENGTH) return;

  const systemId = getSystemId(message.guildId);
  let result;
  try {
    result = await roll(systemId, command);
  } catch (err) {
    console.error(`ダイス評価に失敗しました (system=${systemId}, command=${command})`, err);
    return;
  }
  if (!result) return; // ダイスコマンドではない普通のメッセージ

  try {
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
    console.error('結果の送信に失敗しました', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
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
  const focused = interaction.options.getFocused();
  const matches = focused ? searchGameSystems(focused) : listGameSystems();
  await interaction.respond(
    matches.slice(0, 25).map((s) => ({
      name: truncate(`${s.name} (${s.id})`, 100),
      value: s.id,
    })),
  );
}

async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case 'system':
      await handleSystemCommand(interaction);
      break;
    case 'roll':
      await handleRollCommand(interaction);
      break;
    case 'dicehelp':
      await handleHelpCommand(interaction);
      break;
  }
}

async function handleSystemCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'このコマンドはサーバー内でのみ使用できます。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const input = interaction.options.getString('system', true);
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
    setSystemId(interaction.guildId, system.id);
    await interaction.reply(
      `このサーバーのダイスシステムを **${system.name}** (\`${system.id}\`) に設定しました。`,
    );
    return;
  }

  if (sub === 'show') {
    const systemId = getSystemId(interaction.guildId);
    const system = findGameSystem(systemId);
    await interaction.reply({
      content: `現在のダイスシステム: **${system?.name ?? systemId}** (\`${systemId}\`)`,
      flags: MessageFlags.Ephemeral,
    });
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

async function handleRollCommand(interaction) {
  const command = interaction.options.getString('command', true).trim();
  const systemId = getSystemId(interaction.guildId);
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
  const systemId = getSystemId(interaction.guildId);
  const GameSystem = await loadGameSystem(systemId);
  const system = findGameSystem(systemId);
  const help = [
    `**${system?.name ?? systemId}** (\`${systemId}\`) のコマンド:`,
    '```',
    GameSystem.HELP_MESSAGE.trim(),
    '```',
    `※ ${DEFAULT_SYSTEM_ID} 共通のコマンド(2d6 や 1d100+5 など)もいつでも使えます。`,
  ].join('\n');
  await interaction.reply({ content: truncate(help), flags: MessageFlags.Ephemeral });
}

client.login(token);
