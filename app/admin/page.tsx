'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { WordCandidate } from '@/types';
import type { Tab } from '@/components/admin/shared';
import { Spinner } from '@/components/admin/shared';
import AdminSidebar from '@/components/admin/AdminSidebar';
import WordsTab from '@/components/admin/WordsTab';
import AddWordTab from '@/components/admin/AddWordTab';
import CsvTab from '@/components/admin/CsvTab';
import SetsTab from '@/components/admin/SetsTab';
import SettingsTab from '@/components/admin/SettingsTab';
import UsersTab from '@/components/admin/UsersTab';
import AgentTab from '@/components/admin/AgentTab';

const TAB_TITLES: Record<Tab, string> = {
  words: 'Words',
  add: 'Add Word',
  csv: 'CSV Upload',
  sets: 'Flashcard Sets',
  settings: 'Settings',
  users: 'Users',
  agent: 'AI Agent',
};

export default function AdminPage() {
  const { user, profile, loading: authLoading, profileLoading, isAdmin } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('words');

  // Fetch pending candidates count for the sidebar badge
  const { data: pendingCandidates = 0 } = useQuery({
    queryKey: ['admin-candidates-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('word_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user && !!isAdmin,
  });

  // Auth guard
  useEffect(() => {
    if (!authLoading && !profileLoading && (!user || !isAdmin)) {
      router.replace('/');
    }
  }, [user, authLoading, profileLoading, isAdmin, router]);

  if (authLoading || profileLoading) return <Spinner />;
  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-950 lg:flex">
      {/* Sidebar */}
      <AdminSidebar activeTab={tab} onTabChange={setTab} pendingCandidates={pendingCandidates} />

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Page header */}
        <div className="flex items-center gap-3 px-4 lg:px-8 py-4 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.name ?? ''}
              width={32}
              height={32}
              className="rounded-full shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold shrink-0">
              {profile?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight">{TAB_TITLES[tab]}</h1>
            <p className="text-xs text-gray-500 truncate">{profile?.name ?? user.email}</p>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 px-4 lg:px-8 py-6 overflow-auto">
          {tab === 'words' && <WordsTab onNavigateToAdd={() => setTab('add')} />}
          {tab === 'add' && <AddWordTab />}
          {tab === 'csv' && <CsvTab />}
          {tab === 'sets' && <SetsTab />}
          {tab === 'settings' && <SettingsTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'agent' && <AgentTab />}
        </div>
      </main>
    </div>
  );
}
