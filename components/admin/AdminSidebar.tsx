'use client';

import { BookOpen, Plus, Upload, Layers, Settings, Users, Bot } from 'lucide-react';
import type { Tab } from './shared';

const SECTIONS = [
  {
    label: 'Content',
    items: [
      { tab: 'words' as Tab, label: 'Words', icon: BookOpen },
      { tab: 'add' as Tab, label: 'Add Word', icon: Plus },
      { tab: 'csv' as Tab, label: 'CSV Upload', icon: Upload },
      { tab: 'sets' as Tab, label: 'Flashcard Sets', icon: Layers },
    ],
  },
  {
    label: 'Game',
    items: [{ tab: 'settings' as Tab, label: 'Settings', icon: Settings }],
  },
  {
    label: 'Students',
    items: [
      { tab: 'users' as Tab, label: 'Users', icon: Users },
      { tab: 'agent' as Tab, label: 'AI Agent', icon: Bot },
    ],
  },
];

interface AdminSidebarProps {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  pendingCandidates?: number;
}

export default function AdminSidebar({ activeTab, onTabChange, pendingCandidates = 0 }: AdminSidebarProps) {
  return (
    <>
      {/* ── Desktop sidebar (lg+) ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-gray-800 py-6 gap-1 overflow-y-auto">
        {SECTIONS.map((section, si) => (
          <div key={section.label} className={si > 0 ? 'mt-4' : ''}>
            <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
              {section.label}
            </p>
            {section.items.map(({ tab, label, icon: Icon }) => {
              const active = activeTab === tab;
              const badge = tab === 'agent' && pendingCandidates > 0 ? pendingCandidates : null;
              return (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    active
                      ? 'bg-violet-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge !== null && (
                    <span className="bg-amber-500 text-black text-[10px] font-bold rounded-full min-w-4.5 h-4.5 flex items-center justify-center px-1">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* ── Mobile tab strip (< lg) ───────────────────────────────────────── */}
      <nav className="lg:hidden flex overflow-x-auto gap-1 px-3 py-2 border-b border-gray-800 bg-gray-900/80 shrink-0">
        {SECTIONS.flatMap((s) => s.items).map(({ tab, label, icon: Icon }) => {
          const active = activeTab === tab;
          const badge = tab === 'agent' && pendingCandidates > 0 ? pendingCandidates : null;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`relative shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors min-w-13 ${
                active ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="leading-tight">{label}</span>
              {badge !== null && (
                <span className="absolute top-1 right-1 bg-amber-500 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
