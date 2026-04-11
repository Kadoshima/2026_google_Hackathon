import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Reviewer Zero',
  description: 'Reviewer Zeroのプライバシーポリシー',
};

const LAST_UPDATED = '2026-04-08';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">プライバシーポリシー</h1>
      <p className="text-sm text-gray-500 mb-8">最終更新日: {LAST_UPDATED}</p>

      <section className="prose prose-gray max-w-none space-y-6 text-gray-800">
        <p>
          Reviewer Zero（以下「本サービス」といいます）は、ユーザーのプライバシーを尊重し、
          個人情報の保護に最大限の注意を払います。本ポリシーは、本サービスを利用するにあたって
          取得・利用する情報の種類、取り扱い方針、ユーザーの権利について定めるものです。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">1. 取得する情報</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            ユーザーがアップロードした論文・PR・ドキュメント・スプレッドシート等の成果物
            （以下「アーティファクト」）。
          </li>
          <li>
            アーティファクトに付随するメタデータ（タイトル、ドメインタグ、言語設定など）。
          </li>
          <li>クライアント端末識別用の不可逆ハッシュ化されたトークン。</li>
          <li>アクセスログ（IPアドレス、リクエストID、UserAgent等）。</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900">2. 利用目的</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>本サービスの機能（解析、口頭試問生成、パッチ生成、レポート出力）の提供</li>
          <li>本サービスの品質向上およびセキュリティ確保</li>
          <li>不正利用の検知および防止</li>
          <li>法令上必要な対応</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900">3. 保存ポリシー（Retention Mode）</h2>
        <p>
          本サービスはセッション単位で2種類の保存モードを提供します。
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>NO_SAVE</strong>: 解析完了後、原則として一定時間内にアーティファクトおよび
            派生データを削除します。
          </li>
          <li>
            <strong>SAVE</strong>: ユーザーが明示的に保持を選択した場合に限り、指定TTLの間
            データを保持します。
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900">4. 第三者提供</h2>
        <p>
          本サービスは、ユーザーの同意なく個人を特定できる情報を第三者に提供しません。
          ただし、解析処理のためにGoogle Cloud Platform（Vertex AI、Cloud Storage、Firestore、
          Cloud Tasks等）を利用しており、当該処理に必要な範囲でデータが処理されます。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">5. データの所在</h2>
        <p>
          データは原則として日本国内（asia-northeast1リージョン）のGoogle Cloudに保存されます。
          ただし、Vertex AIによる推論処理は他リージョンを経由する場合があります。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">6. ユーザーの権利</h2>
        <p>
          ユーザーは以下の権利を行使できます。
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>自身のセッションデータの削除請求</li>
          <li>保持期間（TTL）の変更</li>
          <li>本ポリシーの内容に関する問い合わせ</li>
        </ul>
        <p>
          請求は <code>privacy@reviewer-zero.example</code>（実運用前にご自身のドメインに置き換えてください）
          までご連絡ください。リクエストIDをご記入いただくと対応がスムーズです。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">7. セキュリティ</h2>
        <p>
          本サービスはデータの安全性を確保するため、TLS暗号化、最小権限のIAM、
          シークレットマネージャによる秘匿情報の管理、構造化ログの監査等の管理策を実装しています。
        </p>

        <h2 className="text-xl font-semibold text-gray-900">8. 改定</h2>
        <p>
          本ポリシーは法令の変更または運用上の必要に応じて改定されることがあります。
          重要な変更がある場合は本ページにて告知します。
        </p>
      </section>
    </div>
  );
}
