# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## これは何か

Window Tagger: Chrome の「ウィンドウ」単位で名前と色のタグを付け、そのウィンドウの全タブ右下（設定で四隅から選択可）に常時バッジ表示する Manifest V3 拡張機能。ビルドツール・バンドラー・依存パッケージは一切なく、4つの JS/HTML ファイルをそのまま Chrome が読み込む。UI 文言・コメント・ドキュメントはすべて日本語。

## 開発コマンド

`package.json` はなく、ビルド・lint・テストの仕組みは存在しない。開発フローは「ファイルを編集 → 拡張機能を再読み込み」のみ。

- 読み込み: `chrome://extensions` を開き、デベロッパーモードを ON にして「パッケージ化されていない拡張機能を読み込む」からリポジトリ直下（`manifest.json` があるフォルダ）を選択する。
- `background.js` / `content.js` を変更したとき: `chrome://extensions` で当該拡張の再読み込みアイコンを押し、さらに検証に使っているタブも再読み込み（F5）する。再読み込み前に注入されたコンテンツスクリプトは古いままなので必須。
- `popup.html` / `popup.js` を変更したとき: 拡張機能自体の再読み込みは不要で、ポップアップを開き直せば反映される。
- アイコンは手で編集せず生成する: `tools/make_icons.py`（`pip install pillow` が必要）が2枚重なったタグのロゴを 512px で描画し、各サイズへ縮小する。アイコンを変えたい場合はこのスクリプトを編集して `python tools/make_icons.py` を再実行する。

自動テストは存在しない。変更を検証する際は、拡張機能を手動で読み込み、複数のタブ・ウィンドウにまたがってポップアップからのタグ付け・解除・位置変更の一連の動作を確認すること。

## アーキテクチャ

背景（service worker）・コンテンツスクリプト・ポップアップの3つが `chrome.runtime` のメッセージだけでやり取りする。共有モジュールは存在しないため、`background.js` の `onMessage` リスナーで定義されているメッセージ種別がそのままコンポーネント間のインターフェースになっている。

- **`background.js`**（service worker）— 唯一の正とするデータ保持先。2つのストアを持つ。
  - `chrome.storage.session[KEY]`: `{ [windowId]: {name, color} }`、タグ本体。永続化しないのは意図的な設計であり、不具合ではない — Chrome はウィンドウIDを再起動のたびに振り直すため、永続化すると「前回とは別のウィンドウに以前のタグが付く」壊れ方をする（README「タグは永続化されません」参照）。
  - `chrome.storage.local[SETTINGS_KEY]`: `{ position, size }`、バッジを表示する四隅の位置と大きさ（小・中・大）。こちらは全ウィンドウ共通の表示設定なので `storage.local` に永続化される。`saveSettings` は片方のキーだけ渡された場合に備え、既存設定とマージしてから保存する。
  - メッセージ種別: `getTag`（送信元タブの `sender.tab.windowId` から自分のウィンドウIDを解決する — コンテンツスクリプト自身は自分のウィンドウIDを知らない）、`getSettings`、`setSettings`、`setTag`、`readTag`（ポップアップが windowId を明示して問い合わせる用）。
  - `broadcast(windowId, tag)` がそのウィンドウの全タブへ `{type: 'tag', tag, position, size}` を配る。`sendToTab` は送信に失敗すると `chrome.scripting.executeScript` で `content.js` をその場で注入してから再送する。これは拡張機能のインストール／再読み込みより前から開いていたタブ（宣言的な `content_scripts` の対象外）を救済するための仕組み。
  - `chrome.tabs.onAttached`（タブを別ウィンドウへドラッグ）と `chrome.tabs.onUpdated` の `status === 'complete'`（ページ遷移で注入済みDOMが消える）でタグを貼り直し、`chrome.windows.onRemoved` でそのウィンドウのタグ情報を掃除する。
  - `saveSettings` は位置変更を即座にタグ付き全ウィンドウへ配信する（位置は全体設定のため）。

- **`content.js`** — `manifest.json` の `content_scripts`（`all_frames: false`）により宣言的に注入されるほか、上記のオンデマンド注入でも入る。バッジは `position:fixed` のホスト要素に付けた**closed shadow DOM** の中に描画する。これは、ページ側の CSS と衝突させないことと、ページ側の JS からラベル文字列を読み取れないようにすることの両方が目的。`window.__windowTaggerLoaded` で二重注入を防止。読み込み時に自分のウィンドウIDを持たないため `getTag` を送って自分のタグを取りに行き、以降は push される `{type:'tag'}` メッセージを待ち受けるだけになる。
- **`popup.js` / `popup.html`** — ツールバーの UI（`Ctrl+Shift+Y` の `_execute_action` コマンドからも開ける）。`chrome.windows.getCurrent()` で自分のウィンドウを解決し、あとは background.js が公開する同じメッセージ API 経由でタグ・設定を読み書きするだけ。四隅の位置選択はクリック時に即時反映（`setSettings`）、名前・色は「適用」ボタン押下時のみ反映（`setTag`）という非対称な UX になっている。

**バリデーションは `background.js` と `content.js` の両方に意図的に重複実装**されている（両方に `sanitize()`、同じ `COLOR_RE`/`MAX_NAME` 定数）。色は inline CSS に、名前は `textContent`/DOM に流れ込むため、どちらの境界でも相手側の検証やメッセージ送信元を信用せず再検証する設計。

## 保つべきセキュリティ／権限の前提

`<all_urls>` の host permission と `scripting`/`tabs` 権限は、各タブに1つバッジ要素を描くためだけに要求している。ページ内容の読み取り・外部通信・依存パッケージは一切なく、これは README「権限について」と `PRIVACY.md` で利用者に明示している約束事。`background.js`/`content.js` を変更する際は、この境界（ページ内容を読まない・外部通信をしない・解析／収集を行わない）を壊さないこと。
