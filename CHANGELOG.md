# Changelog

すべての重要な変更をこのファイルに記録します。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、
[Semantic Versioning](https://semver.org/lang/ja/) を採用します。

## [Unreleased]

## [0.3.0] - 2026-06-22

### Changed

- `genji-out-of-dict` の既定スコープを **名詞（固有名詞を含む）のみ** に変更（`includeVerbsAdjectives` の既定値を `true` → `false`）。幻辞には日常的な動詞・形容詞の収録が少なく、`青い`/`旨い`/`測る`/`観る` のような一般的な活用語が大量に「未収録」と誤検出されていたため。誤字・誤変換の発見という本来の目的は名詞照合で十分に果たせる。
- 動詞・形容詞の照合は引き続きオプション `includeVerbsAdjectives: true` で有効化できる（挙動は従来どおり basic_form 照合）。

### Note

- 既存ユーザーが設定で `includeVerbsAdjectives` を明示的に `true` に上書きしている場合は従来どおり動詞・形容詞も照合される。本変更が影響するのは既定設定を使用しているユーザーのみ。

## [0.2.0] - 2026-06-21

### Added

- `genji-out-of-dict` に型解析ベースのノイズフィルタを追加（`src/lib/genji-noise-filter.ts`）。実テキストでの過剰検出を抑制する。辞書照会の前に、文法的ノイズを品詞・活用・文字種から判定して除外する：
  - **記号・約物** — `——` `～` 等、記号を名詞と誤分類したトークン（文字種判定）。
  - **軽動詞・補助語** — `する`/`くる`（`conjugation_type`）＋ 補助動詞の閉じた小集合（`ある`/`いる`/`なる`/`やる` 等）。
  - **形式名詞・副詞的語** — `名詞,副詞可能` / `名詞,非自立`（品詞タグ判定。語リストは持たない）。
  - **活用の派生形** — 可能動詞（`書ける`/`消せる` 等、`一段` ＋ え段-る シグネチャ）。
- 各カテゴリを個別に切り替える設定オプション `filterSymbols` / `filterLightVerbs` / `filterFormalNouns` / `filterDerivedConjugations`（既定すべて `true`）。

### Note

- フィルタは検出を抑制する方向にのみ作用し、誤検出を増やさない。`コーヒー`/`畦道`/`観る` のような「実在するが幻辞に未収録」の語は引き続き検出される（幻辞の収録漏れとして扱う）。

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
