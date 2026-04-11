'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * App-router error boundary. Caught errors thrown by any client component
 * inside this segment surface here. Includes a "Reset" CTA so users can
 * recover without a full reload.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Reviewer Zero] unhandled UI error', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-red-100 rounded-lg shadow-sm p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          予期しないエラーが発生しました
        </h1>
        <p className="text-sm text-gray-600 mb-2">
          画面の表示中に問題が発生しました。再読み込みをお試しください。
        </p>
        {error.digest ? (
          <p className="text-xs text-gray-400 mb-6">
            エラーID: <code className="font-mono">{error.digest}</code>
          </p>
        ) : (
          <div className="mb-6" />
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            再試行
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            ホームへ
          </Link>
        </div>
      </div>
    </div>
  );
}
