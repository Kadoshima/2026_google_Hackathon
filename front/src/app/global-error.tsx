'use client';

import { useEffect } from 'react';

/**
 * Root-level error boundary. This is the only place that can catch errors
 * thrown by the root layout itself or by providers mounted in layout.tsx.
 *
 * NOTE: Next.js documents that `global-error.tsx` must render its own
 * `<html>` and `<body>` tags, because the default layout may not be
 * available at the time it renders.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Reviewer Zero] root error boundary', error);
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f9fafb',
          color: '#111827',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            padding: 32,
            border: '1px solid #fee2e2',
            borderRadius: 8,
            background: '#ffffff',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>
            予期しないエラーが発生しました
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#6b7280',
              marginBottom: error.digest ? 8 : 24,
            }}
          >
            アプリケーションの起動中に問題が発生しました。ページを再読み込みしてください。
          </p>
          {error.digest ? (
            <p
              style={{
                fontSize: 12,
                color: '#9ca3af',
                marginBottom: 24,
              }}
            >
              エラーID:{' '}
              <code style={{ fontFamily: 'monospace' }}>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: '#111827',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}
