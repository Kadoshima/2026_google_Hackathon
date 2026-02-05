'use client';

import Link from 'next/link';
import { useAppStore } from '@/store/useAppStore';
import { Menu, Settings, PlusCircle, Home } from 'lucide-react';

export function TopNav() {
  const toggleSideNav = useAppStore((state) => state.toggleSideNav);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-16 px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSideNav}
            className="p-2 rounded-md hover:bg-gray-100"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-indigo-600">
              Reviewer Zero
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">ホーム</span>
          </Link>
          <Link
            href="/new"
            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">新規査読</span>
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">設定</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
