# FocusFlow — Architecture Guide for AI Agents

**Disclaimer:** This document describes the codebase as-is. Read this first before making any modifications to understand how the pieces connect.

---

## Quick Start (30 seconds)

Vite + React + TypeScript SPA with Supabase backend. No framework router — 6 screens are tab-switched via Zustand state.

**Stack:**
- Vite 8 + React 19 + TypeScript 7
- Supabase (direct from browser via JS SDK, no API routes or server)
- TanStack React Query 5 (server-state data fetching)
- Zustand 5 (UI state only)
- Tailwind CSS v4 + tw-animate-css + Geist font
- 15 shadcn/ui components (button, card, dialog, select, etc.)
- GitHub Pages deployment via GitHub Actions
- Deployed at: `https://ardyazizzz.github.io/focusflow`
- Brand accent color: deep teal `#2d6a6e`

**To run locally:**
```bash
npm install
# Create .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

---

## Project Structure

```
src/
  main.tsx                  # React entry point
  App.tsx                   # Root: QueryClientProvider + layout + tab routing
  index.css                 # Tailwind v4 + CSS variables + cursor/press styles

  lib/
    supabase.ts             # Supabase client (Proxy mock when unconfigured)
    utils.ts                # cn() helper

  types/
    index.ts                # All TypeScript interfaces

  store/
    use-app-store.ts        # Zustand store (UI-only: activeTab, pomodoroState, coachMessages, foundationExpandedGoal)

  components/screens/
    focus-screen.tsx        # NOW card + UP NEXT + Pomodoro timer
    capture-screen.tsx      # Create task form with icons + None options
    backlog-screen.tsx      # Queue management, filters, edit/delete/reopen, hover details
    foundation-screen.tsx   # Goals → bottlenecks CRUD with collapsible cards
    coach-screen.tsx        # AI chat with full DB context
    settings-screen.tsx     # Pomodoro, dimensions, AI Coach config

  components/ui/            # 15 used shadcn/ui components

supabase/
  schema.sql                # Full DB schema with triggers, GRANTs, RLS, seed data

.github/workflows/deploy.yml
vite.config.ts              # @ alias + /focusflow/ base path
```

---

## Data Model (5 Tables, lowercase snake_case)

```
goals ──1:N──▶ bottlenecks ──1:N──▶ tasks
                                        │
                                        ├──▶ execution_dimension_options (priority, required)
                                        ├──▶ execution_dimension_options (impact, optional)
                                        ├──▶ execution_dimension_options (clarity, optional)
                                        └──▶ execution_dimension_options (time, optional)

app_settings  (key-value pairs, no relations)
```

### Tasks table key columns
| Column | Type | Notes |
|---|---|---|
| `title` | TEXT | Task description |
| `goal_id` | TEXT FK → goals | **Nullable** (optional, None) |
| `bottleneck_id` | TEXT FK → bottlenecks | **Nullable** (optional, None) |
| `priority_option_id` | TEXT FK → execution_dimension_options | **Required** |
| `impact_option_id` | TEXT FK | Nullable |
| `clarity_option_id` | TEXT FK | Nullable |
| `time_option_id` | TEXT FK | Nullable |
| `status` | TEXT | `'pending'` or `'completed'` |
| `queue_order` | INTEGER | Default 9999. Focus sorts by this asc. Auto-set to 9999 on complete/skip. |
| `completed_at` | TIMESTAMPTZ | Nullable |

### execution_dimension_options
Seeded: priority (P1–P4), impact (Transformational–Minimal), clarity (Crystal Clear–Unknown), time (Immediate–Flexible).

### app_settings
Flat key-value: `pomodoroDuration`, `dimensionName_priority`, etc.

All tables: RLS on, GRANT ALL to anon/authenticated, auto-update trigger for `updated_at`.

---

## Critical Gotchas

### 1. FK Ambiguity (tasks → execution_dimension_options)
Tasks has 4 FKs to the same table. **Must use explicit FK hints:**
```ts
priority_option:execution_dimension_options!tasks_priority_option_id_fkey(id, label)
impact_option:execution_dimension_options!tasks_impact_option_id_fkey(id, label)
clarity_option:execution_dimension_options!tasks_clarity_option_id_fkey(id, label)
time_option:execution_dimension_options!tasks_time_option_id_fkey(id, label)
```
Without `!fk_name` suffix, PostgREST returns 400.

### 2. Count queries
Supabase returns `[{ count: number }]`, not `{ _count }`. Transform manually:
```ts
_count: { tasks: (g.tasks as [{ count: number }] | undefined)?.[0]?.count ?? 0 }
```

### 3. All names lowercase snake_case
PostgREST folds unquoted identifiers. Using `Goal` or `createdAt` causes 400 errors. Always use `goals`, `created_at`, `goal_id`, etc.

### 4. Supabase mock
`supabase.ts` uses a `Proxy` mock when no credentials configured. Returns empty data for reads, errors for writes. App renders without Supabase configured.

### 5. Coach state
`coachMessages` is in-memory Zustand state only. Lost on tab switch or remount.

### 6. SelectTrigger press effect
Shadcn Select triggers have `button:active { transform: scale(0.97) }` excluded via CSS: `[data-slot="select-trigger"]:not(:disabled):active { transform: none }`.

### 7. React Query + async functions
Always use `async/await` for queryFn/mutationFn. `.then()` chains return `PromiseLike<T>` which React Query 5 may reject.

---

## Screen-by-Screen Details

### Focus
- Fetches pending tasks ordered by `queue_order` then `created_at`
- Shows ONE "NOW" card (big) + "UP NEXT" compact list (tasks 2-4)
- Pomodoro timer EMBEDS into the NOW card when Start Focus is clicked (no visual jump)
- Timer controls: Pause/Resume, Stop (exits focus mode), Complete
- On complete: `status='completed'`, `completed_at=now()`, `queue_order=9999`
- On skip: `queue_order=9999` (moves to end of queue)
- Celebration overlay on complete, toast + next task slides up automatically
- Empty state: "Go to Backlog" and "Capture a task" buttons

### Capture
- Task Description (Textarea with Pencil icon), Goal+Bottleneck side-by-side, Priority (required)
- All optional selects have "None" option (`value=""`)
- Impact/Clarity/Time in "More options" collapsible
- Goal and Bottleneck ARE optional (nullable in DB)

### Backlog
- 3 filter pills: Priority (all/P1–P4), Status (all/pending/completed), Queue (all/in queue/not in queue)
- Task cards: queue number badge (clickable), description (no truncation), meta rows
- Goal/Bottleneck row with Target/TriangleAlert icons
- Priority/Deadline row with Flag/CalendarDays icons
- Impact/Clarity/Time on HOVER via `group-focus:opacity-100` (tap-to-reveal on phone, hover on PC)
- Edit dialog: all selects have "None", dimension keys use `impact_option_id` (not `impactOptionId`) — must use snake_case in form state keys
- Completed: strikethrough + Reopen (RotateCcw) button. Hover-revealed action buttons.
- Reopen sets `status='pending'`, `completed_at=null`
- Search bar: filters by `task.title` case-insensitive
- "manage in Backlog" link when >4 tasks shown

### Foundation
- Goals with count badges, collapsible bottlenecks, CRUD for both
- Cascade delete: deletes tasks → bottlenecks → goal manually

### Coach
- Fetches ALL data ad-hoc (not React Query) on each message
- Builds system prompt with goals, bottlenecks, tasks, dimensions
- Supports DeepSeek (API: `api.deepseek.com/v1/chat/completions`) or Gemini (API: `generativelanguage.googleapis.com`)
- API key + provider + model read from localStorage, keys prefixed `focusflow_ai_`
- Falls back to env vars `VITE_DEEPSEEK_API_KEY`, `VITE_GEMINI_API_KEY`

### Settings
- Pomodoro duration slider (5–60 min, step 5)
- Dimension names (customizable labels for priority/impact/clarity/time)
- ExecutionDimensionOptions CRUD (add/edit/delete options per dimension)
- AI Coach config: provider selector + model selector + API key input — all saved to localStorage

---

## Design Conventions

### Colors
- Primary: deep teal `#2d6a6e` (light mode), `#4a8a8e` (dark mode, not used yet)
- Priority badges: P1 = rose/red, P2 = amber/yellow, others = gray
- Completed: muted foreground + line-through
- In-queue card: subtle teal tint `bg-primary/[0.03]` + `border-primary/20`

### Icons by context
| Context | Icon |
|---|---|
| Goal | `Target` |
| Bottleneck | `TriangleAlert` |
| Priority | `Flag` |
| Impact | `Zap` (hover-revealed) |
| Clarity | `Eye` (hover-revealed) |
| Time | `Clock` (hover-revealed) |
| Deadline | `CalendarDays` |
| Notes | `StickyNote` |

### Buttons press effect
Global `button:active { transform: scale(0.97) }` applies EXCEPT `[data-slot="select-trigger"]` which has `transform: none`.

---

## Deployment

`.github/workflows/deploy.yml`:
- Triggers on push to `main`
- Injects secrets as `.env` file
- Builds with Vite
- Deploys dist/ to GitHub Pages

**Required GitHub Secrets:**
- `SUPABASE_URL` — project URL
- `SUPABASE_ANON_KEY` — anon key
- `DEEPSEEK_API_KEY` or `GEMINI_API_KEY` — (optional) for AI Coach

**Site URL:** `https://ardyazizzz.github.io/focusflow`
**Repo:** `https://github.com/ardyazizzz/focusflow`
