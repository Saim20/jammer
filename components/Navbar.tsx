'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Trophy, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <BookOpen className="w-6 h-6 text-violet-400" />
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Vocab Jam
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <Link
            href="/leaderboard"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="hidden sm:inline">Leaderboard</span>
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-violet-300 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}

          {user && (
            <>
              <div className="flex items-center gap-2 pl-3 ml-2 border-l border-gray-800">
                {user.user_metadata?.avatar_url ? (
                  <Image
                    src={user.user_metadata.avatar_url as string}
                    alt={(user.user_metadata?.full_name as string) ?? 'User'}
                    width={32}
                    height={32}
                    className="rounded-full ring-2 ring-violet-500"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-bold">
                    {((user.user_metadata?.full_name as string) ?? user.email ?? 'U')[0]?.toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:block text-sm text-gray-300 max-w-[120px] truncate">
                  {(user.user_metadata?.full_name as string) ?? user.email}
                </span>
              </div>

              <button
                onClick={logout}
                title="Sign out"
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors ml-1"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
