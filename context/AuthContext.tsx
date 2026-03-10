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
    console.debug('[Auth] fetchProfile start', { userId });
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, avatar_url, role, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle();
      console.debug('[Auth] fetchProfile result', { data, error });
      setProfile(data as UserProfile | null);
    } catch (err) {
      console.error('[Auth] fetchProfile threw', err);
      setProfile(null);
    }
  }

  useEffect(() => {
    console.debug('[Auth] useEffect mount — calling getSession()');

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.debug('[Auth] getSession() resolved', {
        hasSession: !!session,
        userId: session?.user?.id ?? null,
        expiresAt: session?.expires_at ?? null,
        error,
      });
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      console.debug('[Auth] loading → false (getSession)');
      if (session?.user) {
        setProfileLoading(true);
        fetchProfile(session.user.id).finally(() => {
          console.debug('[Auth] profileLoading → false (getSession path)');
          setProfileLoading(false);
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('[Auth] onAuthStateChange', {
        event,
        hasSession: !!session,
        userId: session?.user?.id ?? null,
      });
      if (event === 'INITIAL_SESSION') {
        console.debug('[Auth] INITIAL_SESSION skipped (handled by getSession)');
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      console.debug('[Auth] loading → false (onAuthStateChange:', event, ')');
      if (session?.user) {
        setProfileLoading(true);
        await fetchProfile(session.user.id);
        console.debug('[Auth] profileLoading → false (onAuthStateChange path)');
        setProfileLoading(false);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
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
