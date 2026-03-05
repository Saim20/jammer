# Vocab Jam – Copilot Instructions

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Firebase 12 (Auth + Firestore) · Lucide React

## Project layout
```
app/            # Routes: / (landing), /game, /leaderboard
components/     # Pure UI: GameBoard, CountdownTimer, Navbar
context/        # AuthContext — single source of Firebase user state
lib/firebase.ts # Firebase singleton (auth, db, googleProvider)
types/index.ts  # Word and LeaderboardEntry interfaces
scripts/        # Admin SDK tooling (seed-firestore.mjs)
firestore.rules # Security rules — deploy with firebase-tools
```

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
| `words` | ✅ auth only | ❌ never | Admin SDK (`scripts/seed-firestore.mjs`) |
| `leaderboard` | ✅ auth only | create only (own entry) | `app/game/page.tsx` via `addDoc` + `serverTimestamp()` |

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
