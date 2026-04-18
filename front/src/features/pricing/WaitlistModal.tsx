'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { waitlistApi, type WaitlistPlan } from '@/api';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  plan: WaitlistPlan;
  planLabel: string;
  onClose: () => void;
};

const PLAN_DESCRIPTION: Record<WaitlistPlan, string> = {
  PRO: 'Pro プラン（個人・研究者向け）',
  TEAM: 'Team プラン（複数席・SSO 相当）',
  ENTERPRISE: 'Enterprise（自社ドメイン・SLA・オンプレミス）'
};

export function WaitlistModal({ open, plan, planLabel, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [useCase, setUseCase] = useState('');
  const [succeeded, setSucceeded] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      waitlistApi.submit({
        email: email.trim(),
        plan,
        ...(company.trim() ? { company: company.trim() } : {}),
        ...(useCase.trim() ? { useCase: useCase.trim() } : {}),
        source: 'pricing'
      }),
    onSuccess: () => {
      setSucceeded(true);
    }
  });

  useEffect(() => {
    if (open) {
      setSucceeded(false);
      mutation.reset();
      const id = requestAnimationFrame(() => firstInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const errorMessage =
    mutation.isError
      ? (mutation.error as Error | undefined)?.message || '送信に失敗しました。'
      : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-title"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className="bg-white w-full max-w-lg rounded-xl shadow-xl border border-gray-200">
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 id="waitlist-title" className="text-xl font-bold text-gray-900">
              {planLabel} への申し込み
            </h2>
            <p className="text-sm text-gray-500 mt-1">{PLAN_DESCRIPTION[plan]}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100"
            aria-label="閉じる"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {succeeded ? (
          <div className="p-6 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">お申し込みを受け付けました</p>
              <p className="text-sm text-gray-600 mt-2">
                {email} 宛に、提供開始時にご連絡します。<br />
                その間も Free プランで Reviewer Zero をお試しいただけます。
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                閉じる
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="p-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              mutation.mutate();
            }}
          >
            <div>
              <label htmlFor="waitlist-email" className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
                <span className="text-red-600 ml-1">*</span>
              </label>
              <input
                ref={firstInputRef}
                id="waitlist-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            {plan !== 'PRO' && (
              <div>
                <label htmlFor="waitlist-company" className="block text-sm font-medium text-gray-700 mb-1">
                  組織名（任意）
                </label>
                <input
                  id="waitlist-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="株式会社サンプル"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            )}
            <div>
              <label htmlFor="waitlist-usecase" className="block text-sm font-medium text-gray-700 mb-1">
                主なユースケース（任意）
              </label>
              <textarea
                id="waitlist-usecase"
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                placeholder="例: 研究室で月10本の論文投稿前チェックに使いたい"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>

            {errorMessage && (
              <div className={cn(
                'flex items-start gap-2 px-3 py-2 rounded-md text-sm',
                'bg-red-50 text-red-700 border border-red-200'
              )}>
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={onClose}>
                キャンセル
              </Button>
              <Button type="submit" disabled={mutation.isPending || !email.trim()}>
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                申し込む
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              受信したメールは提供開始のお知らせにのみ使用します。
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
