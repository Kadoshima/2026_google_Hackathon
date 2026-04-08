import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm text-gray-500">
        <p>
          &copy; {new Date().getFullYear()} Reviewer Zero. All rights reserved.
        </p>
        <nav aria-label="legal" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/legal/privacy"
            className="hover:text-gray-900 transition-colors"
          >
            プライバシーポリシー
          </Link>
          <Link
            href="/legal/terms"
            className="hover:text-gray-900 transition-colors"
          >
            利用規約
          </Link>
          <Link
            href="/settings"
            className="hover:text-gray-900 transition-colors"
          >
            設定
          </Link>
          <a
            href="https://github.com/Kadoshima/2026_google_Hackathon"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900 transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
