'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  profileLoading: false,
  isAdmin: false,
  signInWithGoogle: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const router = useRouter();

  async function fetchProfile(userId: string) {
    try {
      const { data } = await supabase
        .from('users')
        .select('id, name, avatar_url, role, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle();
      setProfile(data as UserProfile | null);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    // getSession() reads from localStorage — clears loading immediately
    // without blocking on a network round-trip.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false); // auth state is known — unblock page guards immediately
      if (session?.user) {
        setProfileLoading(true);
        fetchProfile(session.user.id).finally(() => setProfileLoading(false));
      }
    });

    // onAuthStateChange handles post-init events: SIGNED_IN, SIGNED_OUT,
    // TOKEN_REFRESHED, etc. INITIAL_SESSION is skipped because getSession()
    // already resolved the initial state.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        setProfileLoading(true);
        await fetchProfile(session.user.id);
        setProfileLoading(false);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function signInWithGoogle() {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/learn`,
          queryParams: { prompt: 'select_account' },
        },
      });
    } catch (err) {
      console.error('Google sign-in failed:', err);
    }
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (err) {
      console.error('Sign-out failed:', err);
    }
  }

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, profileLoading, isAdmin, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
