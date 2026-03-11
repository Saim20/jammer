# Vocab Jam – Copilot Instructions

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Supabase (Auth + PostgreSQL) · Lucide React

## Project layout
```
app/            # Routes: / (landing), /game, /admin, /leaderboard, /learn, /stats, /api/embed
components/     # Pure UI: GameBoard, CountdownTimer, Navbar, FlashCard
context/        # AuthContext — single source of Supabase user state + isAdmin flag
lib/supabase.ts # Supabase client singleton
sql/            # tables/, functions/, migrations/ — canonical SQL source
types/index.ts  # Exported types (snake_case to match SQL columns)
scripts/        # Seed tooling
```

## Conventions

### Path alias
`@/` resolves to the **project root** (not `src/`). Example: `import { supabase } from '@/lib/supabase'`.

### All routes are Client Components
Every page uses `'use client'`. Auth guards use:
```tsx
useEffect(() => {
  if (!authLoading && !user) router.replace('/');
}, [user, authLoading, router]);
```

### Supabase client singleton
`lib/supabase.ts` creates a single `createClient(url, key, { auth: { flowType: 'implicit' } })` instance. Never create additional clients.

### Auth flow
- Sign in uses **redirect-based OAuth** (`supabase.auth.signInWithOAuth`), not a popup.
- `flowType: 'implicit'` handles the session from the URL hash — no `/auth/callback` route needed.
- `AuthContext` calls `supabase.auth.getSession()` on mount and listens via `onAuthStateChange`.
- Google metadata: `user.user_metadata.full_name`, `user.user_metadata.avatar_url`. User ID: `user.id`.

### Database access patterns
- `words` — one-time fetch in `app/game/page.tsx`
- `leaderboard` — initial fetch + Realtime channel in `app/leaderboard/page.tsx`; always remove channel on unmount
- `game_config` — single row (`id = 1`), fetched with `.eq('id', 1).single()`, saved with `.upsert({ id: 1, ...config })`
- `admins` — presence check with `.eq('user_id', userId).maybeSingle()` in `AuthContext`

### Type naming — snake_case matches SQL columns
All DB interface properties use **snake_case**: `correct_definition`, `user_id`, `word_count`, etc.

### Game state machine
`Phase = 'loading' | 'playing' | 'feedback' | 'finished'` — all game logic in `app/game/page.tsx`. `hasAnsweredRef` guards against simultaneous timer tick + click.

### Scoring formula
`score += 100 + (timeLeft × 10)` per correct answer. `timer_seconds = 10` (default) → max **200 pts/word**.

### Custom animations
`animate-shake` and `animate-pop` are custom keyframes in `app/globals.css` — not Tailwind utilities.

### Layout height offset
Navbar is `h-16` (64 px). Full-page sections use `min-h-[calc(100vh-64px)]`.

### Tailwind v4 syntax
`globals.css` uses `@import "tailwindcss"` and `@theme inline {}` — not the v3 `@tailwind` directives.

## Supabase tables

| Table | Client reads | Client writes | Who writes |
|---|---|---|---|
| `words` | ✅ auth only | ✅ admin only (CRUD) | Admin dashboard or seed script |
| `admins` | ✅ own row only | ❌ never | Supabase Dashboard / SQL |
| `leaderboard` | ✅ auth only | insert only (own entry) | `app/game/page.tsx` |
| `game_config` | ✅ auth only | ✅ admin only (upsert) | Admin settings tab |
| `game_sessions` | ✅ own rows | insert only | `submit_game_session` RPC |
| `user_word_stats` | ✅ own rows | via RPC | `submit_game_session` / `submit_flashcard_review` |
| `flashcard_sets` | ✅ auth only | ❌ | Seed / admin |
| `flashcard_reviews` | ✅ own rows | upsert (own) | `submit_flashcard_review` RPC |
| `user_category_progress` | ✅ own rows | via RPC | `submit_game_session` RPC |

## Admin system
- Row in `admins` with user UUID grants admin. `AuthContext` exposes `isAdmin: boolean`.
- `app/admin/page.tsx` redirects non-admins to `/`, double-guarded by RLS.
- **Features**: Words CRUD, Add Word form, CSV upload with validation, Game config settings.
- **Grant access**: `insert into public.admins (user_id) values ('<user-uuid>');`

### CSV format
```
word,correctDefinition,distractor1,distractor2,distractor3,difficulty
```

## Developer workflows

```bash
npm run dev    # localhost:3000
npm run build  # validate TS/JSX (run before committing)
npm run lint   # ESLint
```

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## External image domain
Only `lh3.googleusercontent.com` is whitelisted in `next.config.ts`.
