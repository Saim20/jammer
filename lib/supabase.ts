import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * Single Supabase client instance for the entire app.
 * Using implicit flow so no /auth/callback route is needed —
 * all auth state is managed client-side via URL hash on redirect return.
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    flowType: 'implicit',
  },
});
