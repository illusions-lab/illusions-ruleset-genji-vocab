# Changelog

すべての重要な変更をこのファイルに記録します。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、
[Semantic Versioning](https://semver.org/lang/ja/) を採用します。

## [Unreleased]

## [0.1.2] - 2026-06-21

### Changed

- マーケットプレイス用 OG 画像（`OG.png`）を作成。
- `TERMS.md` を記入し、`LICENSE` の著作権者を記入。

## [0.1.1] - 2026-06-21

### Changed

- `genji-out-of-dict` のルール名を「辞書外語の検出」→「未知語の検出」に変更（「外語＝外国語」と誤読されやすかったため）。README・ドキュメントの表記も「未知語」に統一。
- `genji-out-of-dict` の `applicableModes` を全校正モード（`novel` / `official` / `blog` / `academic` / `sns`）に設定。これまで空配列で、どの校正モードでも自動有効化されずモード切替のたびに無効化されていた。

## [0.1.0] - 2026-06-21

### Added

- 初版。幻辞（Genji）辞書に未収録の語を検出する `genji-out-of-dict` ルール（L2 形態素解析）を実装。
