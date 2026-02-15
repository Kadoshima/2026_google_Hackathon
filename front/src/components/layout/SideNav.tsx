'use client';

import Link from 'next/link';
import { useAppStore } from '@/store/useAppStore';
import { formatDate } from '@/lib/utils';
import { FileText, Clock } from 'lucide-react';

export function SideNav() {
  const sessions = useAppStore((state) => state.sessions);
  const isSideNavOpen = useAppStore((state) => state.uiState.isSideNavOpen);

  if (!isSideNavOpen) return null;

  return (
    <aside className="w-64 min-h-[calc(100vh-64px)] bg-white border-r border-gray-200">
      <div className="p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          最近のセッション
        </h2>
        
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">
            セッションがありません
          </p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => (
              <li key={session.session_id}>
                <Link
                  href={`/session/${session.session_id}`}
                  className="flex items-start gap-3 p-3 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {session.title || '無題の論文'}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(session.updated_at)}
                    </p>
                    <span className={`
                      inline-block mt-1.5 px-2 py-0.5 text-xs rounded-full
                      ${getStatusStyle(session.status)}
                    `}>
                      {getStatusLabel(session.status)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function getStatusStyle(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700';
    case 'analyzing':
      return 'bg-yellow-100 text-yellow-700';
    case 'completed':
      return 'bg-blue-100 text-blue-700';
    case 'error':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return '進行中';
    case 'analyzing':
      return '解析中';
    case 'completed':
      return '完了';
    case 'error':
      return 'エラー';
    default:
      return '不明';
  }
}
