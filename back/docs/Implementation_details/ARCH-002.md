# ARCH-002：README群の統合更新（root/back/front を artifact拡張前提へ統一）

## 担当者
- 萩原

## 指示
- ルートREADMEと各アプリREADMEを同じ設計思想で揃える
- 「論文専用ツール」表現をやめ、Accountability Layerとして説明する
- Core Engine / Domain Adapter / Understanding Score の位置づけを明記する

## 作業ログ
- `README.md` を更新
  - 課題定義を「人間の理解担保」へ再定義
  - `Decompose -> Challenge -> Verify` を中核フローとして明記
  - Explain-to-Ship と Understanding Score の方針を追記
- `back/README.md` を更新
  - Artifact対応範囲とAgent実行シーケンスを整理
  - 進捗API（`summary.agents`）と環境変数の説明を補強
- `front/README.md` を更新
  - Agentシーケンスバー中心のUX方針を明記
  - サマリーの日本語可読性方針を整理
