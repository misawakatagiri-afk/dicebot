import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('system')
    .setDescription('このサーバーで使うダイスシステムの設定')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('このサーバーで使うダイスシステムを登録する')
        .addStringOption((opt) =>
          opt
            .setName('system')
            .setDescription('ゲームシステム名またはID(入力で候補が出ます)')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('show').setDescription('現在登録されているダイスシステムを表示する'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('利用できるダイスシステムを検索する')
        .addStringOption((opt) =>
          opt.setName('keyword').setDescription('検索キーワード').setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('ダイスを振る')
    .addStringOption((opt) =>
      opt.setName('command').setDescription('ダイスコマンド(例: 2d6, CC<=54)').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('dicehelp')
    .setDescription('現在のダイスシステムのコマンド一覧を表示する'),
].map((c) => c.toJSON());
