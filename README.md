# Reviewer Zero

Reviewer Zero は、AI時代の知的成果物に対する **Accountability Layer（説明責任レイヤー）** です。
単なる生成・添削ではなく、**著者が本当に理解しているか** を検証し、理解できた内容だけを成果物へ反映します。

## コンセプト

### 解く課題

AIで成果物は高速に作れる一方で、次の事故が増えています。

- 書いた人が中身を説明できない
- 根拠が弱いまま出荷される
- レビューが形式化し、責任の所在が曖昧になる

Reviewer Zero はこのギャップを埋めるために、レビューを次の3段階に標準化します。

1. **Decompose**: 成果物を構造分解する（主張と根拠を抽出）
2. **Challenge**: 断線・矛盾・飛躍を検出する
3. **Verify**: 口頭試問で理解を検証し、差分へ反映する

### 共通プリミティブ（IR）

入力ドメインに依存しない内部表現として、以下を共通化します。

- `Claim`
- `Evidence`
- `Assumption`
- `Constraint`
- `Decision`
- `Gap`

## アーキテクチャ

### Core Engine + Domain Adapter

- **Core Engine**: `Decompose -> Challenge -> Verify`
- **Domain Adapter**: 何をClaim/Evidenceと見なすかをドメイン別に定義

この分離により、論文向けMVPを壊さずに、PR・提案書・設計書・表計算へ拡張できます。

### Explain-to-Ship

Reviewer Zero の実行フローは次の循環です。

1. 弱点抽出（Gap）
2. Oral Defense（説明要求）
3. 回答の評価
4. Patch/ToDo生成
5. 再評価（改善可視化）

「説明できるまで出荷しない」をプロダクトとして実装します。

## 実装状況

- 実装済みの主入力: `PAPER`（PDF / LaTeX ZIP）
- 拡張中の入力: `PR` / `DOC` / `SHEET`
- Agent構成:
  - Planner
  - Extractor
  - Claim Miner（Critic -> Refiner反復）
  - Preflight Guardian
  - Evidence Auditor
  - Logic Sentinel
  - Prior-Art Coach
  - Synthesizer

## Understanding Score（拡張方針）

最終的には、成果物品質に加えて **理解度の定量指標** を提供します。

評価軸の例:

- Claim-Evidence対応の強さ
- 口頭試問の回答具体性・一貫性
- 指摘後の修正反映率

## リポジトリ構成

- `back/` API・解析オーケストレーション・保存
- `front/` 進捗可視化・口頭試問・Patch導線
- `shared/` 契約型（API schema / 共通型）

## クイックスタート

### Backend

```bash
cd back
npm install
cp .env.example .env
npm run build
npm start
```

### Frontend

```bash
cd front
npm install
cp .env.local.example .env.local
npm run dev
```

## 関連ドキュメント

- `back/README.md`
- `front/README.md`
- `back/docs/TODO.md`
- `back/docs/Implementation_details/`
