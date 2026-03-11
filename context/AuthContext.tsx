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

  // Fetch profile in a separate effect so it never runs inside onAuthStateChange,
  // which would call getSession() while the auth lock is still held.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    console.debug('[Auth] fetchProfile start', { userId: user.id });
    setProfileLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, avatar_url, role, plan, created_at, updated_at')
          .eq('id', user.id)
          .maybeSingle();
        console.debug('[Auth] fetchProfile result', { data, error });
        setProfile(data as UserProfile | null);
      } catch (err: unknown) {
        console.error('[Auth] fetchProfile threw', err);
        setProfile(null);
      } finally {
        console.debug('[Auth] profileLoading → false');
        setProfileLoading(false);
      }
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    console.debug('[Auth] useEffect mount');

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.debug('[Auth] onAuthStateChange', {
        event,
        hasSession: !!session,
        userId: session?.user?.id ?? null,
      });
      // Only set state here — never call Supabase APIs inside this callback
      // as it may be invoked while the auth lock is held (causes deadlock).
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      console.debug('[Auth] loading → false (onAuthStateChange:', event, ')');
    });

    return () => {
      console.debug('[Auth] useEffect cleanup — unsubscribing');
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function signInWithGoogle() {
    console.debug('[Auth] signInWithGoogle triggered', { origin: window.location.origin });
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/learn`,
          queryParams: { prompt: 'select_account' },
        },
      });
    } catch (err) {
      console.error('[Auth] Google sign-in failed:', err);
    }
  }

  async function logout() {
    console.debug('[Auth] logout triggered');
    try {
      await supabase.auth.signOut();
      console.debug('[Auth] signOut complete — navigating to /');
      router.push('/');
    } catch (err) {
      console.error('[Auth] Sign-out failed:', err);
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
