'use client';

import { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { SideNav } from './SideNav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="flex">
        <SideNav />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
