import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '利用規約 | Reviewer Zero',
  description: 'Reviewer Zeroの利用規約',
};

const LAST_UPDATED = '2026-04-08';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">利用規約</h1>
      <p className="text-sm text-gray-500 mb-8">最終更新日: {LAST_UPDATED}</p>

      <section className="prose prose-gray max-w-none space-y-6 text-gray-800">
        <p>
          本規約は、Reviewer Zero（以下「本サービス」）の利用条件を定めるものです。
          本サービスを利用することにより、本規約に同意したものとみなします。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">第1条（定義）</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>「ユーザー」とは、本サービスを利用する個人または法人をいいます。</li>
          <li>「アーティファクト」とは、ユーザーが本サービスにアップロードする論文・PR・ドキュメント等をいいます。</li>
          <li>「解析結果」とは、本サービスがアーティファクトに対して生成するクレーム抽出・証拠監査・口頭試問・パッチ提案等の出力をいいます。</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900">第2条（利用資格）</h2>
        <p>
          ユーザーは、本サービスの利用に必要な権限を有していることを表明し保証するものとします。
          特に、アップロードするアーティファクトについて、適法に保有するか、利用許諾を得ていることを保証します。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">第3条（禁止事項）</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>法令または公序良俗に違反する行為</li>
          <li>第三者の知的財産権、プライバシー権その他の権利を侵害する行為</li>
          <li>本サービスのインフラに過度な負荷を与える行為（自動化された大量リクエスト等）</li>
          <li>本サービスの解析結果を用いて他者を欺く行為</li>
          <li>本サービスのリバースエンジニアリング、または不正アクセスの試み</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900">第4条（解析結果の取扱い）</h2>
        <p>
          解析結果は、AIによる自動生成を含みます。本サービスは解析結果の正確性、完全性、特定目的への適合性を
          保証しません。ユーザーは解析結果を最終判断の唯一の根拠とせず、必ず人間によるレビューと専門家の判断を
          併用してください。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">第5条（知的財産権）</h2>
        <p>
          アーティファクトに関する著作権その他の知的財産権はユーザーに帰属します。
          本サービスは、本サービスの提供に必要な範囲でのみアーティファクトを利用し、
          解析処理以外の目的には利用しません。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">第6条（料金）</h2>
        <p>
          本サービスの料金体系は別途定めるプラン表に従います。無料プランで提供される機能の範囲は
          予告なく変更される場合があります。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">第7条（免責事項）</h2>
        <p>
          本サービスの利用または利用不能から生じる直接的・間接的な損害について、本サービスの提供者は
          一切の責任を負いません。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">第8条（サービスの変更・終了）</h2>
        <p>
          本サービスの提供者は、ユーザーへの事前通知の上、本サービスの内容を変更し、または提供を停止・終了することができます。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">第9条（規約の変更）</h2>
        <p>
          本規約は法令の変更または運用上の必要に応じて変更されることがあります。重要な変更がある場合は
          本ページにて告知します。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">第10条（準拠法・管轄）</h2>
        <p>
          本規約は日本法を準拠法とし、本サービスに関する紛争は、本サービス提供者の所在地を管轄する裁判所を
          専属的合意管轄とします。
        </p>
      </section>
    </div>
  );
}
