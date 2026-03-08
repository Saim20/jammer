---
description: "Use when building UI, adding components, styling with Tailwind, or modifying layouts. Enforces mobile-first responsive design, component reuse, and consistent theming."
applyTo: "**/*.tsx, **/*.css"
---

# UI / Styling Instructions

## Mobile-First Responsive Design

- **Always design for the smallest screen first.** Add breakpoint modifiers (`sm:`, `md:`, `lg:`) only to _expand_ the layout — never assume a wide viewport as the default.
- Use the standard breakpoint ladder: `base` (< 640 px) → `sm:` (≥ 640 px) → `md:` (≥ 768 px) → `lg:` (≥ 1024 px). Only skip a tier if the design genuinely has nothing to change there.
- **Multi-column grids on mobile must be justified.** `grid-cols-4` at base is only acceptable when each item is icon-only. Text labels must wrap to fewer columns (e.g., `grid-cols-2 sm:grid-cols-4`).
- Touch targets must be at least `min-h-12` (48 px) on interactive elements.
- Use `px-4` as the minimum horizontal page padding; never let content bleed to the viewport edge.

## Layout Conventions

- Every full-page route uses `min-h-[calc(100vh-64px)]` to offset the `h-16` Navbar.
- Inner content containers use `max-w-2xl mx-auto` (content) or `max-w-5xl mx-auto` (wide sections). Do not mix these arbitrarily — wide containers are for data tables and leaderboards only.
- Use `flex flex-col items-center justify-center` for centered-content pages and `py-12` for scrollable list pages.

## Componentization

- **Extract before you duplicate.** Any UI pattern used in more than one place — or likely to be — must live in `components/`. Pages in `app/` should be thin orchestrators.
- **Component responsibility rule:** A component owns its own layout, styling states (idle / active / error), and accessibility attributes. It must _not_ own data-fetching or auth logic.
- Props should expose semantic state, not implementation detail. Prefer `variant="correct" | "wrong" | "idle"` over passing color class strings as props.
- Export one component per file; the filename must match the component name (PascalCase).

## Theming

### Tailwind v4 Gradient Syntax

Always use the Tailwind v4 gradient syntax. **Never use the v3 form.**

```tsx
// ✅ Correct (v4)
className="bg-linear-to-r from-violet-400 to-fuchsia-400"

// ❌ Wrong (v3 — do not use)
className="bg-gradient-to-r from-violet-400 to-fuchsia-400"
```

### Color Tokens

- The two root CSS variables for semantics are `--color-background` and `--color-foreground`. Use `bg-background` / `text-foreground` for base surface/text.
- **Always use full Tailwind class names** — never store or interpolate partial class fragments (e.g., `'violet'`) and concatenate them. The JIT compiler requires static strings.

```ts
// ✅ Correct
const CATEGORY_META = {
  survival: { colorClass: 'text-emerald-400', bgClass: 'bg-emerald-950' },
}

// ❌ Wrong — JIT will not detect this
const CATEGORY_META = {
  survival: { color: 'emerald' }, // then used as `text-${color}-400`
}
```

### Semantic Color Palette

Use these color families consistently:

| Semantic role | Color family |
|---|---|
| Brand / primary | `violet-*` → `fuchsia-*` (gradient) |
| Correct / success | `emerald-*` |
| Warning / caution | `yellow-*` / `amber-*` |
| Error / wrong | `red-*` |
| Info / neutral action | `blue-*` |
| Surfaces / borders | `gray-*` |

Do not use colors from one semantic group for a different role (e.g., don't use `emerald` for an informational badge).

### Custom Animations

`animate-shake` and `animate-pop` are defined in `app/globals.css` — **not** Tailwind utilities. Don't try to extend `tailwind.config` for these; simply apply the class directly.

## Accessibility

- All interactive elements must have a visible focus style (use `focus-visible:ring-2 focus-visible:ring-violet-500`).
- `<button>` elements must always have either a visible label or `aria-label` when icon-only.
- Color must not be the only differentiator; pair color changes with text, icon, or border changes.
