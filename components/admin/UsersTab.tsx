'use client';

import { useState } from 'react';
import { Search, ChevronDown, ChevronUp, ChevronRight, Users } from 'lucide-react';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { UserProfile } from '@/types';
import { PlanBadge, RoleBadge, TabSpinner } from './shared';
import StudentStatsPanel from './StudentStatsPanel';

type PlanFilter = 'all' | 'free' | 'student' | 'pro';
type RoleFilter = 'all' | 'admin' | 'player';
type SortField = 'name' | 'joined' | 'sessions' | 'lastActive';

export default function UsersTab() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserProfile[];
    },
    enabled: !!user && !!isAdmin,
  });

  const { data: userSessionCounts = {} } = useQuery({
    queryKey: ['admin-user-session-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('user_id, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const counts: Record<string, { count: number; lastPlayed: string | null }> = {};
      for (const s of data ?? []) {
        if (!counts[s.user_id]) counts[s.user_id] = { count: 0, lastPlayed: null };
        counts[s.user_id].count++;
        if (!counts[s.user_id].lastPlayed) counts[s.user_id].lastPlayed = s.created_at;
      }
      return counts;
    },
    enabled: !!user && !!isAdmin,
  });

  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortField, setSortField] = useState<SortField>('joined');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [planUpdatingId, setPlanUpdatingId] = useState<string | null>(null);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  }

  async function updateUserPlan(userId: string, plan: 'free' | 'student' | 'pro') {
    setPlanUpdatingId(userId);
    try {
      const { error } = await supabase.from('users').update({ plan }).eq('id', userId);
      if (error) throw error;
      queryClient.setQueryData(['admin-users'], (prev: UserProfile[]) =>
        (prev ?? []).map((u) => (u.id === userId ? { ...u, plan } : u)),
      );
    } catch (err) {
      console.error('Plan update failed:', err);
    } finally {
      setPlanUpdatingId(null);
    }
  }

  // Filter + sort pipeline
  const filteredUsers = allUsers
    .filter((u) => {
      const matchSearch = !search || (u.name ?? '').toLowerCase().includes(search.toLowerCase());
      const matchPlan = planFilter === 'all' || u.plan === planFilter;
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      return matchSearch && matchPlan && matchRole;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = (a.name ?? '').localeCompare(b.name ?? '');
      else if (sortField === 'joined') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortField === 'sessions') cmp = (userSessionCounts[a.id]?.count ?? 0) - (userSessionCounts[b.id]?.count ?? 0);
      else if (sortField === 'lastActive') {
        const tA = userSessionCounts[a.id]?.lastPlayed ? new Date(userSessionCounts[a.id].lastPlayed!).getTime() : 0;
        const tB = userSessionCounts[b.id]?.lastPlayed ? new Date(userSessionCounts[b.id].lastPlayed!).getTime() : 0;
        cmp = tA - tB;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const planCounts = {
    free: allUsers.filter((u) => u.plan === 'free').length,
    student: allUsers.filter((u) => u.plan === 'student').length,
    pro: allUsers.filter((u) => u.plan === 'pro').length,
  };

  const selectedUser = allUsers.find((u) => u.id === selectedUserId) ?? null;

  // Sort indicator component
  function SortBtn({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-0.5 text-left font-medium transition-colors ${active ? 'text-violet-300' : 'text-gray-400 hover:text-white'}`}
      >
        {label}
        <span className="flex flex-col ml-0.5">
          <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${active && sortDir === 'asc' ? 'text-violet-400' : 'text-gray-700'}`} />
          <ChevronDown className={`w-2.5 h-2.5 ${active && sortDir === 'desc' ? 'text-violet-400' : 'text-gray-700'}`} />
        </span>
      </button>
    );
  }

  return (
    <section className="space-y-5">
      {/* Plan distribution summary */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
          <Users className="w-4 h-4 text-gray-500" />
          <span className="text-xs text-gray-400 font-medium">{allUsers.length} total</span>
        </div>
        {(['free', 'student', 'pro'] as const).map((plan) => (
          <div
            key={plan}
            className={`flex items-center gap-1.5 border rounded-xl px-3 py-2 cursor-pointer transition-colors ${
              planFilter === plan
                ? plan === 'student' ? 'bg-blue-950 border-blue-700'
                  : plan === 'pro' ? 'bg-violet-950 border-violet-700'
                  : 'bg-gray-800 border-gray-600'
                : 'bg-gray-900 border-gray-800 hover:border-gray-600'
            }`}
            onClick={() => setPlanFilter(planFilter === plan ? 'all' : plan)}
          >
            <PlanBadge plan={plan} />
            <span className="text-xs text-gray-300 font-bold tabular-nums">{planCounts[plan]}</span>
          </div>
        ))}
      </div>

      {/* Search + role filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedUserId(null); }}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {(['all', 'player', 'admin'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${roleFilter === r ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {r === 'all' ? 'All roles' : r}
            </button>
          ))}
        </div>
      </div>

      {loadingUsers ? <TabSpinner /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Users table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    <th className="px-4 py-3 text-left"><SortBtn field="name" label="User" /></th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Plan</th>
                    <th className="px-4 py-3 text-center hidden sm:table-cell"><SortBtn field="sessions" label="Games" /></th>
                    <th className="px-4 py-3 text-center hidden md:table-cell"><SortBtn field="lastActive" label="Last Active" /></th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-500 text-sm">
                        No users match the current filters.
                      </td>
                    </tr>
                  ) : filteredUsers.map((u) => {
                    const sessionInfo = userSessionCounts[u.id];
                    const lastPlayed = sessionInfo?.lastPlayed
                      ? new Date(sessionInfo.lastPlayed).toLocaleDateString()
                      : '—';
                    const isSelected = selectedUserId === u.id;
                    return (
                      <tr
                        key={u.id}
                        onClick={() => setSelectedUserId(isSelected ? null : u.id)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-violet-950/40' : 'hover:bg-gray-800/50'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {u.avatar_url ? (
                              <Image src={u.avatar_url} alt={u.name ?? ''} width={28} height={28} className="rounded-full shrink-0" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {u.name?.[0]?.toUpperCase() ?? '?'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-white text-xs leading-tight truncate max-w-[120px]">
                                {u.name ?? 'Unknown'}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {u.role === 'admin' && <RoleBadge role="admin" />}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.plan}
                            onChange={(e) => { e.stopPropagation(); updateUserPlan(u.id, e.target.value as 'free' | 'student' | 'pro'); }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={planUpdatingId === u.id}
                            className={`text-xs rounded-lg px-2 py-1 border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                              u.plan === 'student' ? 'bg-blue-950 border-blue-700 text-blue-300'
                                : u.plan === 'pro' ? 'bg-violet-950 border-violet-700 text-violet-300'
                                : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}
                          >
                            <option value="free">free</option>
                            <option value="student">student</option>
                            <option value="pro">pro</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400 text-xs hidden sm:table-cell">
                          {sessionInfo?.count ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500 text-xs hidden md:table-cell">{lastPlayed}</td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'rotate-90 text-violet-400' : 'text-gray-600'}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredUsers.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/30 text-xs text-gray-500">
                {filteredUsers.length} of {allUsers.length} user{allUsers.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Student stats panel */}
          {selectedUser ? (
            <StudentStatsPanel
              userId={selectedUser.id}
              user={selectedUser}
              onClose={() => setSelectedUserId(null)}
            />
          ) : (
            <div className="hidden lg:flex items-center justify-center bg-gray-900/40 border border-dashed border-gray-800 rounded-2xl min-h-48">
              <p className="text-gray-600 text-sm">Select a user to view their stats</p>
            </div>
          )}
        </div>
      )}

      {/* Mobile stats panel below table */}
      {selectedUser && (
        <div className="lg:hidden">
          <StudentStatsPanel
            userId={selectedUser.id}
            user={selectedUser}
            onClose={() => setSelectedUserId(null)}
          />
        </div>
      )}
    </section>
  );
}
