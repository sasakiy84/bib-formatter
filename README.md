# Bib Formatter

.bib を biblatex に統一し、`Year_Authors_Title` のファイル名を作るブラウザ用ツールです。ビルド結果は `dist/index.html` の1ファイルで、保存すればオフラインでも動きます。入力した文献情報を送信・保存しません。

公開先: https://sasakiy84.github.io/bib-formatter/

## 使い方

.bib を貼り付けるかファイルを開き、「biblatex に変換」を押します。Ctrl+Enter / ⌘+Enter でも変換できます。結果はコピーまたは .bib として保存できます。ファイル名は文献ごとに選択・コピーできます。

ファイル名には著者の姓を最大3人まで含め、4人以上なら `et-al` を付けます。著者がなければ編者を使います。日本語の姓名を分ける場合は `姓, 名` と記述してください。英語の名前・タイトルの空白はハイフンになります。日本語は保持し、拡張子を含まない名前を UTF-8 で240バイト以内に収めます。

例: `2024_Smith-Jones-Lee-et-al_An-English-Title`

## 変換ルール

- 引用キーと文献順を保持し、種別・標準フィールド名は小文字、値は波括弧、フィールド順は固定にします。LaTeX・数式・大文字保護は保持します。
- `journal → journaltitle`、`address → location`、`school → institution`、`archiveprefix → eprinttype`、`primaryclass → eprintclass` を変換します。両方ある場合は biblatex 側を優先し、値の相違を表示します。
- `conference → inproceedings`、`techreport → report`、`phdthesis / mastersthesis → thesis`、`electronic / www → online` を変換します。学位種別を `type` に残します。
- 数値の年・月・日は `date` に統合します。既存の `date` を優先します。変換できない年月日は保持して確認を促します。日付の実在性や文献情報の正確さを照合するツールではありません。
- DOI の URL 接頭辞を取り除き、数値のページ範囲を `--` に統一します。
- 著者・編者・翻訳者・タイトル・出版情報・識別子・URL・アクセス日・文献間参照など、引用に使うフィールドを許可リストで保持します。正確なリストは `src/formatter.ts` の `fieldOrder` にあります。`_` で始まる独自フィールドはすべて保持します。
- `abstract`、`keywords`、`file`、`note`、管理ソフトのメタデータなど、許可リストにないフィールドは削除し、名前を表示します。
- `@string` は展開し、`@preamble` は保持し、コメントは除きます。構文エラーと引用キーの重複は変換を中止します。未知の文献種別は保持して確認を促します。
- 著者・編者・タイトル・年の欠落、crossref の未解決・循環、ファイル名の重複を表示します。文献種別ごとの必須項目をすべて検証するものではありません。

## 開発

Bun 1.4.4 を使用します。フレームワークと CSS ライブラリは使わず、HTML の標準フォームと小さな CSS で構成しています。BibTeX の構文解析には Better BibTeX for Zotero のパーサー `@retorquere/bibtex-parser` を使います。

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun run serve
```

ブラウザ検証:

```sh
bunx playwright install chromium
bun run test:e2e
# システムの Chromium を使う場合:
CHROMIUM_PATH=/usr/bin/chromium bun run test:e2e
```

変換関数は Bun のテストで英語・日本語の論文、書籍、学位論文などを検証します。Playwright ではデスクトップ・モバイル幅で変換、ファイル入出力、コピー、エラー表示、オフライン利用を検証します。テスト用の文献データには検証用の架空レコードも含まれます。

## 公開

`main` への push で GitHub Actions が型検査・テスト・ビルドを行い、成功した単一 HTML を GitHub Pages に公開します。リポジトリの Pages の公開元は GitHub Actions に設定します。
