# Vocab Jam – Copilot Instructions

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Supabase (Auth + PostgreSQL) · Lucide React

## Project layout
```
app/            # Routes: / (landing), /game, /admin, /leaderboard
components/     # Pure UI: GameBoard, CountdownTimer, Navbar
context/        # AuthContext — single source of Supabase user state + isAdmin flag
lib/supabase.ts # Supabase client singleton
types/index.ts  # Word and LeaderboardEntry interfaces (snake_case to match SQL columns)
scripts/        # Seed tooling
supabase/       # schema.sql — run in Supabase SQL editor to bootstrap the database
```

## Critical conventions

### Path alias
`@/` resolves to the **project root** (not `src/`). Example: `import { supabase } from '@/lib/supabase'`.

### All routes are Client Components
Every page uses `'use client'`. There is no server-side data fetching. Auth guards use:
```tsx
useEffect(() => {
  if (!authLoading && !user) router.replace('/');
}, [user, authLoading, router]);
```

### Supabase client singleton
`lib/supabase.ts` creates a single `createClient(url, key, { auth: { flowType: 'implicit' } })` instance. Never create additional clients.

### Auth flow
- Sign in uses **redirect-based OAuth** (`supabase.auth.signInWithOAuth`), not a popup.
- No `/auth/callback` route is needed because `flowType: 'implicit'` handles the session from the URL hash automatically.
- `AuthContext` calls `supabase.auth.getSession()` on mount and listens via `onAuthStateChange`.
- Supabase `User` metadata (from Google): `user.user_metadata.full_name`, `user.user_metadata.avatar_url`.
- User identifier: `user.id` (not `user.uid`).

### Database access patterns
- `words` — **one-time fetch** with `supabase.from('words').select('*')` in `app/game/page.tsx`
- `leaderboard` — **initial fetch + Realtime channel** in `app/leaderboard/page.tsx`; always remove channel on unmount
- `game_config` — single row (`id = 1`), fetched with `.eq('id', 1).single()`, saved with `.upsert({ id: 1, ...config })`
- `admins` — presence check with `.eq('user_id', userId).maybeSingle()` in `AuthContext`

### Type naming — snake_case matches SQL columns
All database interface properties use **snake_case** to match PostgreSQL column names:
- `Word`: `correct_definition`, `distractors`, `difficulty`
- `LeaderboardEntry`: `user_id`, `user_name`, `user_photo`, `created_at`
- `GameConfig`: `word_count`, `timer_seconds`, `difficulty_min`, `difficulty_max`

### Game state machine
`Phase = 'loading' | 'playing' | 'feedback' | 'finished'` — all game logic lives in `app/game/page.tsx`. `hasAnsweredRef` (a `useRef`) guards against a timer tick and a click firing simultaneously.

### Scoring formula
`score += 100 + (timeLeft × 10)` per correct answer. `timer_seconds = 10` (default), so max is **200 pts/word**.

### Custom animations
`animate-shake` and `animate-pop` are **custom keyframes** defined in `app/globals.css` — they are not Tailwind utilities.

### Layout height offset
The Navbar is `h-16` (64 px). Full-page sections must use `min-h-[calc(100vh-64px)]` to avoid overflow.

### Tailwind v4 syntax
`globals.css` uses `@import "tailwindcss"` and `@theme inline {}` — **not** the v3 `@tailwind base/components/utilities` directives.

## Supabase tables

| Table | Client reads | Client writes | Who writes |
|---|---|---|---|
| `words` | ✅ auth only | ✅ admin only (CRUD) | Admin dashboard UI or seed script |
| `admins` | ✅ own row only | ❌ never | Supabase Dashboard or SQL manually |
| `leaderboard` | ✅ auth only | insert only (own entry) | `app/game/page.tsx` via `supabase.from('leaderboard').insert(...)` |
| `game_config` | ✅ auth only | ✅ admin only (upsert) | Admin dashboard settings tab |

## Admin system

### How it works
- Presence of a row with the user's UUID in the `admins` table grants admin rights.
- `AuthContext` reads this on every sign-in and exposes `isAdmin: boolean`.
- The `Navbar` shows an **Admin** link only when `isAdmin` is true.
- `app/admin/page.tsx` redirects non-admins to `/` — double-guarded by Supabase RLS.

### Granting admin access
In the Supabase Dashboard → Table Editor → `admins`, insert a row with the user's UUID, or run:
```sql
insert into public.admins (user_id) values ('<user-uuid>');
```

### Admin features (app/admin/page.tsx)
- **Words tab** — searchable, sortable table with inline edit (modal) and delete (confirm modal)
- **Add Word tab** — manual form: word, correctDefinition, 3 distractors, difficulty 1–10
- **CSV Upload tab** — upload a `.csv`, preview with per-row validation, batch import
- **Settings tab** — game config: word count, timer, difficulty range

### CSV format
```
word,correctDefinition,distractor1,distractor2,distractor3,difficulty
Ephemeral,"Lasting for a very short time","Having a glowing quality","A deep philosophical thought","Showing warlike attitude",6
```

## Developer workflows

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build — use this to validate TS/JSX before committing
npm run lint         # ESLint (eslint-config-next)
```

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```
See `.env.local.example` for the full list.

## External image domain
Only `lh3.googleusercontent.com` is whitelisted in `next.config.ts`. Add new domains there before using `next/image` with any other remote host.

## Critical conventions

### Path alias
`@/` resolves to the **project root** (not `src/`). Example: `import { db } from '@/lib/firebase'`.

### All routes are Client Components
Every page uses `'use client'`. There is no server-side Firestore fetching. Auth guards use:
```tsx
useEffect(() => {
  if (!authLoading && !user) router.replace('/');
}, [user, authLoading, router]);
```

### Firebase singleton pattern
`lib/firebase.ts` uses `getApps().length ? getApp() : initializeApp(...)` to survive Next.js hot-reload. Never call `initializeApp` directly anywhere else.

### Firestore data access
- `words` — **one-time fetch** with `getDocs` in `app/game/page.tsx`
- `leaderboard` — **real-time** with `onSnapshot` in `app/leaderboard/page.tsx`; always unsubscribe on unmount

### Game state machine
`Phase = 'loading' | 'playing' | 'feedback' | 'finished'` — all game logic lives in `app/game/page.tsx`. `hasAnsweredRef` (a `useRef`) guards against a timer tick and a click firing simultaneously.

### Scoring formula
`score += 100 + (timeLeft × 10)` per correct answer. `TIMER_SECONDS = 10`, so max is **200 pts/word**.

### Custom animations
`animate-shake` and `animate-pop` are **custom keyframes** defined in `app/globals.css` — they are not Tailwind utilities. Don't try to extend the Tailwind config for these.

### Layout height offset
The Navbar is `h-16` (64 px). Full-page sections must use `min-h-[calc(100vh-64px)]` to avoid overflow.

### Tailwind v4 syntax
`globals.css` uses `@import "tailwindcss"` and `@theme inline {}` — **not** the v3 `@tailwind base/components/utilities` directives.

## Firestore collections

| Collection | Client reads | Client writes | Who writes |
|---|---|---|---|
| `words` | ✅ auth only | ✅ admin only (CRUD) | Admin dashboard UI or seed script |
| `admins` | ✅ own doc only | ❌ never | Firebase Console or Admin SDK manually |
| `leaderboard` | ✅ auth only | create only (own entry) | `app/game/page.tsx` via `addDoc` + `serverTimestamp()` |

## Admin system

### How it works
- Presence of a document with the user's UID in the `admins` Firestore collection grants admin rights.
- `AuthContext` reads this on every sign-in and exposes `isAdmin: boolean`.
- The `Navbar` shows an **Admin** link only when `isAdmin` is true.
- `app/admin/page.tsx` redirects non-admins to `/` — double-guarded by Firestore rules.

### Granting admin access
In the Firebase Console → Firestore → `admins` collection, create a document whose **ID is the user's UID**. No fields are required; presence is sufficient.

### Admin features (app/admin/page.tsx)
- **Words tab** — searchable, sortable table with inline edit (modal) and delete (confirm modal)
- **Add Word tab** — manual form: word, correctDefinition, 3 distractors, difficulty 1–10
- **CSV Upload tab** — upload a `.csv`, preview with per-row validation, batch import

### CSV format
```
word,correctDefinition,distractor1,distractor2,distractor3,difficulty
Ephemeral,"Lasting for a very short time","Having a glowing quality","A deep philosophical thought","Showing warlike attitude",6
```
A **Download Template** button in the CSV tab provides a ready-to-fill example file.

## Developer workflows

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build — use this to validate TS/JSX before committing
npm run lint         # ESLint (eslint-config-next)

# Seed Firestore (one-time, requires service account):
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json \
  node scripts/seed-firestore.mjs

# Deploy security rules only:
firebase deploy --only firestore:rules
```

## Environment variables
All Firebase config is `NEXT_PUBLIC_FIREBASE_*`. See `.env.local.example` for the full list.  
**`firebase-service-account.json` must never be committed** — it is used only by the seed script locally.

## External image domain
Only `lh3.googleusercontent.com` is whitelisted in `next.config.ts`. Add new domains there before using `next/image` with any other remote host.
