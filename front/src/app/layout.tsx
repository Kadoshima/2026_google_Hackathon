import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/QueryProvider';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Reviewer Zero - 投稿前査読オーケストレーター',
  description: '「査読官に詰められて論文が強固になる」体験を提供する、投稿前査読支援システム',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <QueryProvider>
          <AppShell>
            {children}
          </AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
