'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Minus,
  Sparkles,
  Building2,
  User,
  Users,
  Shield,
  ArrowRight,
  HelpCircle
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { WaitlistModal } from '@/features';
import type { WaitlistPlan } from '@/api';
import { cn } from '@/lib/utils';

type Tier = {
  id: 'FREE' | 'PRO' | 'TEAM' | 'ENTERPRISE';
  name: string;
  tagline: string;
  icon: React.ReactNode;
  price: string;
  priceSuffix?: string;
  priceNote?: string;
  highlight?: boolean;
  bestFor: string;
  features: Array<{ text: string; included: boolean }>;
  cta: {
    label: string;
    action: 'start' | 'waitlist';
    waitlistPlan?: WaitlistPlan;
    href?: string;
  };
};

const TIERS: Tier[] = [
  {
    id: 'FREE',
    name: 'Free',
    tagline: 'まず試す',
    icon: <User className="w-5 h-5" />,
    price: '¥0',
    priceSuffix: '/月',
    priceNote: 'クレジットカード不要',
    bestFor: '個人の検証・デモ確認',
    features: [
      { text: '月 3 本まで解析', included: true },
      { text: 'Understanding Score 表示', included: true },
      { text: '口頭試問（Oral Defense）', included: true },
      { text: 'NO_SAVE モード（自動削除）', included: true },
      { text: '30 日保存 / 履歴管理', included: false },
      { text: 'PR / DOC アダプタ', included: false },
      { text: 'OpenAPI 経由の自動化', included: false },
      { text: 'SSO・監査ログ', included: false }
    ],
    cta: { label: 'いますぐ試す', action: 'start', href: '/new' }
  },
  {
    id: 'PRO',
    name: 'Pro',
    tagline: '毎週レビューする人に',
    icon: <Sparkles className="w-5 h-5" />,
    price: '¥2,980',
    priceSuffix: '/月',
    priceNote: '個人・研究者向け',
    highlight: true,
    bestFor: '論文・技術ブログを定期的に投稿する個人',
    features: [
      { text: '月 50 本まで解析', included: true },
      { text: 'Understanding Score 推移グラフ', included: true },
      { text: '口頭試問 + Auto Patch 制限なし', included: true },
      { text: '30 日保存・履歴検索', included: true },
      { text: 'PR / DOC アダプタ（Beta）', included: true },
      { text: '優先キュー（高速レスポンス）', included: true },
      { text: 'OpenAPI 経由の自動化', included: false },
      { text: 'SSO・監査ログ', included: false }
    ],
    cta: { label: 'Pro を申し込む', action: 'waitlist', waitlistPlan: 'PRO' }
  },
  {
    id: 'TEAM',
    name: 'Team',
    tagline: 'チームで導入する',
    icon: <Users className="w-5 h-5" />,
    price: '¥9,800',
    priceSuffix: '/席 / 月',
    priceNote: '3 席から',
    bestFor: '研究室・プロダクトチーム',
    features: [
      { text: '解析数 無制限（公正使用）', included: true },
      { text: '全プラン機能', included: true },
      { text: 'OpenAPI 経由の自動化', included: true },
      { text: 'GitHub PR 連携（Beta）', included: true },
      { text: 'チーム用 Understanding ダッシュボード', included: true },
      { text: 'SLA（99.5%）', included: true },
      { text: 'SSO（SAML）', included: false },
      { text: '監査ログ・データレジデンシ', included: false }
    ],
    cta: { label: 'Team を申し込む', action: 'waitlist', waitlistPlan: 'TEAM' }
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    tagline: '大規模・規制対応',
    icon: <Building2 className="w-5 h-5" />,
    price: 'お問合せ',
    priceNote: '年間契約・カスタム',
    bestFor: '大学・大企業・規制業界',
    features: [
      { text: 'Team プランの全機能', included: true },
      { text: 'SSO（SAML / OIDC）', included: true },
      { text: '監査ログ・DLP 連携', included: true },
      { text: 'データレジデンシ（東京 / 海外）', included: true },
      { text: 'VPC / プライベート接続', included: true },
      { text: 'DPO / セキュリティレビュー対応', included: true },
      { text: 'オンプレミス導入（要相談）', included: true },
      { text: '専任カスタマーサクセス', included: true }
    ],
    cta: { label: '問い合わせる', action: 'waitlist', waitlistPlan: 'ENTERPRISE' }
  }
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Pro / Team はいつ使えるようになりますか？',
    a: '現在はプライベートベータです。申し込みいただいた順にご案内します。提供開始前は Free プランをご利用ください。'
  },
  {
    q: 'アップロードしたデータは学習に使われますか？',
    a: 'いいえ。Reviewer Zero はアップロードされた成果物を LLM のトレーニングに使用しません。NO_SAVE モードでは解析完了後に原本を削除します。'
  },
  {
    q: '途中でプランを変更できますか？',
    a: 'はい。月単位でアップグレード / ダウングレードできます。日割り計算で請求を調整します。'
  },
  {
    q: 'Enterprise で自社環境に導入できますか？',
    a: '可能です。Cloud Run ベースのリファレンス構成を、お客様の GCP プロジェクトまたはオンプレミスへデプロイします。詳細は個別にご相談ください。'
  }
];

export default function PricingPage() {
  const [modalPlan, setModalPlan] = useState<{ plan: WaitlistPlan; label: string } | null>(null);

  return (
    <div className="max-w-6xl mx-auto">
      <section className="py-16 md:py-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1 text-xs font-medium text-indigo-700 mb-6">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          料金プラン
        </div>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4">
          説明責任に、見合う値段で。
        </h1>
        <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto">
          まずは Free で試して、フィットしたらチームで展開してください。
          <br className="hidden sm:block" />
          いつでも停止できます。
        </p>
      </section>

      <section className="grid lg:grid-cols-4 md:grid-cols-2 gap-5 pb-10">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={cn(
              'relative flex flex-col rounded-xl border bg-white p-6',
              tier.highlight
                ? 'border-indigo-500 shadow-lg ring-2 ring-indigo-100'
                : 'border-gray-200 shadow-sm'
            )}
          >
            {tier.highlight && (
              <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-0.5 text-[11px] font-semibold text-white shadow">
                人気
              </span>
            )}
            <div className="mb-4">
              <div className="flex items-center gap-2 text-indigo-600">
                {tier.icon}
                <h2 className="text-lg font-bold text-gray-900">{tier.name}</h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">{tier.tagline}</p>
            </div>
            <div className="mb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-gray-900">{tier.price}</span>
                {tier.priceSuffix && (
                  <span className="text-sm text-gray-500">{tier.priceSuffix}</span>
                )}
              </div>
              {tier.priceNote && (
                <p className="text-xs text-gray-500 mt-1">{tier.priceNote}</p>
              )}
            </div>
            <p className="text-xs text-gray-600 mb-4">
              <span className="font-medium text-gray-700">向いている方：</span> {tier.bestFor}
            </p>
            <ul className="space-y-2 text-sm flex-1 mb-6">
              {tier.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  {feature.included ? (
                    <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <Minus className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  )}
                  <span className={feature.included ? 'text-gray-700' : 'text-gray-400 line-through'}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>

            {tier.cta.action === 'start' ? (
              <Link href={tier.cta.href ?? '/new'}>
                <Button className="w-full" variant={tier.highlight ? 'primary' : 'outline'}>
                  {tier.cta.label}
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            ) : (
              <Button
                className="w-full"
                variant={tier.highlight ? 'primary' : 'outline'}
                onClick={() =>
                  setModalPlan({
                    plan: tier.cta.waitlistPlan ?? 'PRO',
                    label: tier.name
                  })
                }
              >
                {tier.cta.label}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
          </div>
        ))}
      </section>

      <section className="py-12 border-t border-gray-200">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-2">
          全プラン共通の保証
        </h2>
        <p className="text-center text-gray-600 text-sm mb-10 max-w-xl mx-auto">
          金額にかかわらず、Reviewer Zero はアップロード内容の取り扱いに同じ基準を適用します。
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          <Card>
            <Shield className="w-6 h-6 text-emerald-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">学習利用なし</h3>
            <p className="text-sm text-gray-600">
              アップロードされた成果物は LLM の追加学習に使用されません。
            </p>
          </Card>
          <Card>
            <Shield className="w-6 h-6 text-emerald-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">即時削除オプション</h3>
            <p className="text-sm text-gray-600">
              NO_SAVE モードでは解析後に原本を自動削除。API で削除要求にも即応。
            </p>
          </Card>
          <Card>
            <Shield className="w-6 h-6 text-emerald-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">運用可視化</h3>
            <p className="text-sm text-gray-600">
              構造化ログ・SLO・Runbook を公開。監査・内部統制に耐える設計です。
            </p>
          </Card>
        </div>
      </section>

      <section className="py-12 border-t border-gray-200">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-10">
          よくある質問
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {FAQ.map((item, index) => (
            <Card key={index}>
              <div className="flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5">{item.q}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="py-16">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-10 md:p-14 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            まずは Free で 1 本、査読してみる
          </h2>
          <p className="text-gray-300 mb-8 max-w-xl mx-auto text-sm md:text-base">
            クレジットカード不要。数分で Understanding Score と弱点リストが手に入ります。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/new">
              <Button size="lg" variant="outline" className="bg-white text-gray-900 hover:bg-gray-100 border-white">
                無料で試す
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="lg" variant="outline" className="text-white border-white hover:bg-white/10">
                デモを見る
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <WaitlistModal
        open={modalPlan !== null}
        plan={modalPlan?.plan ?? 'PRO'}
        planLabel={modalPlan?.label ?? 'Pro'}
        onClose={() => setModalPlan(null)}
      />
    </div>
  );
}
