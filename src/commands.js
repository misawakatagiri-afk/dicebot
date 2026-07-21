import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('system')
    .setDescription('ダイスシステムの設定')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('使用するダイスシステムを登録する')
        .addStringOption((opt) =>
          opt
            .setName('system')
            .setDescription('ゲームシステム名またはID(入力で候補が出ます)')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('登録範囲(省略時: サーバー全体)')
            .addChoices(
              { name: 'サーバー全体', value: 'guild' },
              { name: 'このチャンネル/スレッドのみ', value: 'channel' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unset')
        .setDescription('このチャンネル/スレッドの登録を解除してサーバー設定に戻す'),
    )
    .addSubcommand((sub) =>
      sub.setName('show').setDescription('現在のダイスシステム設定を表示する'),
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
    .setName('table')
    .setDescription('オリジナルのランダム表の管理')
    .addSubcommand((sub) =>
      sub.setName('add').setDescription('オリジナル表を作成・登録する(入力フォームが開きます)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('upload')
        .setDescription('テキストファイルからオリジナル表を登録する(フォームに収まらない大きな表向け)')
        .addAttachmentOption((opt) =>
          opt
            .setName('file')
            .setDescription('1行目:表の名前、2行目:ダイス(例 1D100)、3行目以降:出目:結果 の.txtファイル')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('表の呼び出し名(省略時はファイルの1行目が使われます)')
            .setMaxLength(50),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('このサーバーに登録されたオリジナル表の一覧を表示する'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('オリジナル表の内容を表示する')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('表の名前').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('オリジナル表を削除する')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('表の名前').setRequired(true).setAutocomplete(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName('macro')
    .setDescription('複数のダイスをまとめて振るマクロの管理(能力値振りなど)')
    .addSubcommand((sub) =>
      sub.setName('add').setDescription('マクロを作成・登録する(入力フォームが開きます)'),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('このサーバーに登録されたマクロの一覧を表示する'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('マクロの内容を表示する')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('マクロの名前').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('マクロを削除する')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('マクロの名前').setRequired(true).setAutocomplete(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('ダイスを振る')
    .addStringOption((opt) =>
      opt
        .setName('command')
        .setDescription('ダイスコマンドまたはオリジナル表の名前(例: 2d6, CC<=54)')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('dicehelp')
    .setDescription('現在のダイスシステムのコマンド一覧を表示する'),
].map((c) => c.toJSON());
