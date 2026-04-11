import Link from 'next/link';
import { Home, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg shadow-sm p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <FileQuestion className="w-6 h-6 text-gray-500" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          ページが見つかりません
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          お探しのページは存在しないか、移動された可能性があります。
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          ホームへ
        </Link>
      </div>
    </div>
  );
}
