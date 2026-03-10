'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Zap, Trophy, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const FEATURES = [
  { icon: Clock, label: '10-second rounds' },
  { icon: Zap, label: 'Time-bonus scoring' },
  { icon: Trophy, label: 'Global leaderboard' },
  { icon: BookOpen, label: 'IELTS word bank' },
];

export default function LandingPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  // Already logged in → go straight to learn hub
  useEffect(() => {
    console.debug('[LandingPage] auth guard effect', { loading, hasUser: !!user });
    if (!loading && user) {
      console.debug('[LandingPage] redirecting to /learn');
      router.replace('/learn');
    }
  }, [user, loading, router]);

  console.debug('[LandingPage] render', { loading, hasUser: !!user });

  if (loading) {
    console.debug('[LandingPage] showing auth spinner');
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 text-center">
      {/* Hero */}
      <div className="mb-6 flex items-center gap-3">
        <BookOpen className="w-14 h-14 text-violet-400 drop-shadow-[0_0_24px_rgba(167,139,250,0.5)]" />
        <h1 className="text-6xl sm:text-7xl font-extrabold bg-linear-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
          Vocab Jam
        </h1>
      </div>

      <p className="text-lg sm:text-xl text-gray-400 max-w-lg mb-10 leading-relaxed">
        Race against the clock to master high-level IELTS vocabulary.{' '}
        <span className="text-gray-300 font-medium">
          One word. Four options. Ten seconds.
        </span>
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-3 mb-12">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2 bg-gray-800/80 border border-gray-700 rounded-full px-4 py-2 text-sm text-gray-300"
          >
            <Icon className="w-4 h-4 text-violet-400" />
            {label}
          </div>
        ))}
      </div>

      {/* Google Sign-in button */}
      <button
        onClick={signInWithGoogle}
        className="group flex items-center gap-3 bg-white text-gray-900 font-semibold px-8 py-4 rounded-2xl text-lg shadow-lg shadow-black/40 hover:shadow-violet-500/20 hover:scale-[1.03] active:scale-100 transition-all duration-200 cursor-pointer"
      >
        {/* Google logo */}
        <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </button>

      <p className="mt-5 text-sm text-gray-600">
        Free to play &middot; No account setup required
      </p>
    </div>
  );
}
