# Claude Code entrypoint: 勇吉屋EC

作業開始前に、勇吉屋全体の正本仕様を必ず読む。

`/Users/banmako/Library/CloudStorage/Dropbox-becreative/番野誠/ビークリ社内用共有/勇吉屋/YUUKICHIYA_SYSTEM_SPEC.md`

このリポジトリは顧客確認用GitHub Pagesステージングであり、BASE公開テーマとは別である。変更前後に `node scripts/verify-regression-contract.mjs` を実行する。`../base_redesign/scripts/sync-github-pages-preview.mjs` は旧生成元との差分があれば停止するため、回避して上書きせず、差分を手動統合する。

既存の詳細なBASE移行履歴は次も参照する。

`../base_redesign/BASE_HTML_MIGRATION_HANDOFF.md`
