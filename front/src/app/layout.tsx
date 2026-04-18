import type { Metadata, Viewport } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/QueryProvider';
import { AppShell } from '@/components/layout/AppShell';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://reviewer-zero.app';
const siteName = 'Reviewer Zero';
const description =
  'AI時代の説明責任レイヤー。投稿前に「本当に理解しているか」をDecompose → Challenge → Verifyで検証し、説明できた内容だけを成果物に反映します。';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} - 投稿前査読オーケストレーター`,
    template: `%s | ${siteName}`
  },
  description,
  applicationName: siteName,
  keywords: [
    'Reviewer Zero',
    '査読',
    '論文',
    'AI',
    'LLM',
    '説明責任',
    'Accountability',
    'Explain-to-Ship'
  ],
  authors: [{ name: 'Reviewer Zero Team' }],
  category: 'productivity',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: siteUrl,
    siteName,
    title: `${siteName} - 投稿前査読オーケストレーター`,
    description
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} - 投稿前査読オーケストレーター`,
    description
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111827'
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
