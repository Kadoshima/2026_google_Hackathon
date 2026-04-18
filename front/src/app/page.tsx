'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui';
import {
  FileText,
  ArrowRight,
  Shield,
  MessageSquare,
  Sparkles,
  Scissors,
  ScanSearch,
  CheckCircle2,
  ShieldCheck,
  Gauge,
  Users,
  Tag
} from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { ensureClientToken, sessions } = useAppStore();

  useEffect(() => {
    // クライアントトークンを確認/生成
    ensureClientToken();
  }, [ensureClientToken]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero Section */}
      <section className="py-16 md:py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1 text-xs font-medium text-indigo-700 mb-6">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          AI時代の説明責任レイヤー
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
          「説明できるまで出荷しない」を、
          <br className="hidden sm:block" />
          <span className="text-indigo-600">プロダクトにする。</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Reviewer Zero は、AIで作った論文・PR・ドキュメントを
          <br className="hidden sm:block" />
          <strong className="font-semibold text-gray-800">本当に理解しているか</strong>
          検証し、説明できた内容だけを成果物に反映します。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/new">
            <Button size="lg">
              <FileText className="w-5 h-5 mr-2" />
              いますぐ査読する
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <Link href="/demo">
            <Button variant="outline" size="lg">
              <Sparkles className="w-5 h-5 mr-2" />
              デモを見る
            </Button>
          </Link>
        </div>
        <p className="text-xs text-gray-500 mt-6">
          クレジットカード不要 / NO_SAVEモードで即削除可能
        </p>
      </section>

      {/* Problem Section */}
      <section className="py-12 border-t border-gray-200">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            AIで速くなったのに、品質の責任は曖昧になった
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            成果物は高速に作れるのに、書いた本人が中身を説明できない。
            根拠が弱いまま出荷される。レビューが形骸化する。
            Reviewer Zero はこのギャップを埋めます。
          </p>
        </div>
      </section>

      {/* 3-Step Flow */}
      <section className="py-12 border-t border-gray-200">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
          Decompose → Challenge → Verify
        </h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          査読を3つのステージに標準化し、各段階で「説明責任」を可視化します。
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          <StepCard
            step="01"
            icon={<Scissors className="w-8 h-8 text-indigo-600" aria-hidden="true" />}
            title="Decompose"
            subtitle="構造分解"
            description="PDF・LaTeX・PR・ドキュメントから主張（Claim）と根拠（Evidence）を自動抽出。共通中間表現に正規化します。"
          />
          <StepCard
            step="02"
            icon={<ScanSearch className="w-8 h-8 text-indigo-600" aria-hidden="true" />}
            title="Challenge"
            subtitle="弱点検出"
            description="Evidence Auditor・Logic Sentinel・Prior-Art Coach が、断線・矛盾・飛躍・前例不足を指摘。上位リスクを可視化します。"
          />
          <StepCard
            step="03"
            icon={<CheckCircle2 className="w-8 h-8 text-indigo-600" aria-hidden="true" />}
            title="Verify"
            subtitle="理解の検証"
            description="口頭試問（Oral Defense）で著者の理解を確認。説明できた内容だけを Patch / ToDo として差分に反映します。"
          />
        </div>
      </section>

      {/* Understanding Score Section */}
      <section className="py-12 border-t border-gray-200">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 mb-4">
              <Gauge className="w-3.5 h-3.5" aria-hidden="true" />
              Understanding Score
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              説明できる状態まで、あと何%か。
            </h2>
            <p className="text-gray-600 mb-4">
              Evidence・Logic・Specificity・Preflight の 4 軸を 0〜100 に正規化し、
              「誰かに説明したら崩れるか」を一目で可視化します。
            </p>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" aria-hidden="true" />
                主張と根拠の対応強度をスコア化
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" aria-hidden="true" />
                口頭試問と Patch の反映でスコアが上がる
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" aria-hidden="true" />
                著者・レビュアー・マネージャで同じ数字を見られる
              </li>
            </ul>
          </div>
          <div className="relative">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-8">
              <div className="flex flex-col items-center text-center">
                <svg width="180" height="180" viewBox="0 0 140 140" className="-rotate-90">
                  <circle cx="70" cy="70" r="52" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-gray-100" />
                  <circle cx="70" cy="70" r="52" fill="transparent" strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 52}
                    strokeDashoffset={2 * Math.PI * 52 - (74 / 100) * 2 * Math.PI * 52}
                    className="stroke-emerald-500"
                  />
                  <text x="70" y="70" textAnchor="middle" dominantBaseline="central" transform="rotate(90 70 70)" className="text-3xl font-bold fill-emerald-600">74</text>
                  <text x="70" y="92" textAnchor="middle" dominantBaseline="central" transform="rotate(90 70 70)" className="text-xs fill-gray-400">/ 100</text>
                </svg>
                <span className="mt-2 text-xs font-medium px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">良好</span>
                <p className="mt-3 text-xs text-gray-500">口頭試問後のスコア例</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 border-t border-gray-200">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
          主な機能
        </h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          既存のワークフローに差し込める、AI時代の査読パイプライン。
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Shield className="w-8 h-8 text-indigo-600" aria-hidden="true" />}
            title="Evidence Auditor"
            description="主張と根拠の対応関係を分析し、エビデンスの欠如や弱い論理を可視化します。"
          />
          <FeatureCard
            icon={<MessageSquare className="w-8 h-8 text-indigo-600" aria-hidden="true" />}
            title="Oral Defense"
            description="査読官からの質問をシミュレートし、論理の穴を口頭試問形式で発見します。"
          />
          <FeatureCard
            icon={<Sparkles className="w-8 h-8 text-indigo-600" aria-hidden="true" />}
            title="Auto Patch"
            description="修正候補を自動生成し、差分形式で確認・採用することができます。"
          />
        </div>
      </section>

      {/* Trust / Business Section */}
      <section className="py-12 border-t border-gray-200">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          ビジネスでも安心して使える
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <TrustCard
            icon={<ShieldCheck className="w-8 h-8 text-emerald-600" aria-hidden="true" />}
            title="プライバシー重視"
            description="NO_SAVEモードでは解析後に原本を自動削除。GDPRの削除権にも API で対応。"
          />
          <TrustCard
            icon={<Gauge className="w-8 h-8 text-emerald-600" aria-hidden="true" />}
            title="エンタープライズ運用"
            description="Cloud Run / Firestore / Vertex AI 上で稼働。構造化ログ、SLO、Runbook 完備。"
          />
          <TrustCard
            icon={<Users className="w-8 h-8 text-emerald-600" aria-hidden="true" />}
            title="チームでの導入"
            description="OpenAPI 3.1 仕様を公開。CI/CD から API 連携し、既存レビュープロセスに統合できます。"
          />
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-12 border-t border-gray-200">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
          料金はシンプル
        </h2>
        <p className="text-center text-gray-600 mb-10 max-w-2xl mx-auto">
          Free で試して、合えばチームへ展開。クレジットカード不要。
        </p>
        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          <PricingPreview
            name="Free"
            price="¥0"
            note="月 3 本まで / NO_SAVE"
            href="/pricing"
          />
          <PricingPreview
            name="Pro"
            price="¥2,980"
            suffix="/月"
            note="月 50 本 / 履歴保存 / 優先キュー"
            highlight
            href="/pricing"
          />
          <PricingPreview
            name="Team"
            price="¥9,800"
            suffix="/席 / 月"
            note="無制限 / API 連携 / SLA"
            href="/pricing"
          />
        </div>
        <div className="mt-8 text-center">
          <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700">
            <Tag className="w-4 h-4" aria-hidden="true" />
            すべての機能と Enterprise を見る
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 border-t border-gray-200">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-10 md:p-16 text-center text-white shadow-lg">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            まずは 1本、査読してみる
          </h2>
          <p className="text-indigo-100 mb-8 max-w-xl mx-auto">
            PDFまたはLaTeX ZIPをアップロードするだけ。数分で Understanding Score と弱点リストが手に入ります。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/new">
              <Button size="lg" variant="outline" className="bg-white text-indigo-700 hover:bg-indigo-50 border-white">
                <FileText className="w-5 h-5 mr-2" />
                論文をアップロード
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-white border-white hover:bg-white/10">
                料金プランを見る
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <section className="py-12 border-t border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            最近のセッション
          </h2>
          <div className="grid gap-4">
            {sessions.slice(0, 3).map((session) => (
              <Link
                key={session.session_id}
                href={`/session/${session.session_id}`}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors"
              >
                <div>
                  <h3 className="font-medium text-gray-900">
                    {session.title || '無題の論文'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {new Date(session.updated_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  subtitle,
  description
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200 relative">
      <div className="absolute top-4 right-4 text-xs font-mono font-bold text-gray-300">
        {step}
      </div>
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-indigo-600 font-medium mb-3">{subtitle}</p>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function TrustCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

function PricingPreview({
  name,
  price,
  suffix,
  note,
  href,
  highlight
}: {
  name: string;
  price: string;
  suffix?: string;
  note: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block p-6 rounded-xl bg-white border transition-all ${
        highlight
          ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md hover:shadow-lg'
          : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-gray-900">{name}</h3>
        {highlight && (
          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
            人気
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-bold text-gray-900">{price}</span>
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      </div>
      <p className="text-xs text-gray-600">{note}</p>
    </Link>
  );
}
