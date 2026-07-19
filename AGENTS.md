# FocusFlow — Architecture Guide for AI Agents

**Disclaimer:** This document describes the codebase as-is. Read this first before making any modifications to understand how the pieces connect.

---

## Quick Start (30 seconds)

Vite + React + TypeScript SPA with Supabase backend. No framework router—6 screens are tab-switched via Zustand state.

**Stack:**
- Vite 8 + React 19 + TypeScript 7
- Supabase (direct from browser, no API routes)
- TanStack React Query 5 (data fetching)
- Zustand 5 (UI state only: tab, pomodoro, coach messages)
- Tailwind CSS v4 + 15 shadcn/ui components
- GitHub Pages deployment via GitHub Actions

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
  App.tsx                   # Root component: layout + tab routing
  index.css                 # Tailwind v4 + CSS variables
  lib/
    supabase.ts             # Supabase client singleton (with mock fallback)
    utils.ts                # cn() helper (clsx + tailwind-merge)
  types/
    index.ts                # All TypeScript interfaces
  store/
    use-app-store.ts        # Zustand store (UI-only state)
  components/
    screens/
      today-screen.tsx      # Today tab: Pomodoro timer + pending tasks
      capture-screen.tsx    # Capture tab: create task form
      backlog-screen.tsx    # Backlog tab: search/filter/edit/delete tasks
      foundation-screen.tsx # Foundation tab: goals → bottlenecks CRUD
      coach-screen.tsx      # Coach tab: AI chat with context awareness
      settings-screen.tsx   # Settings tab: pomodoro duration, dimension config
    ui/                     # 15 used shadcn/ui components
supabase/
  schema.sql                # Full DB schema + RLS + seed data
```

---

## Data Model (5 Tables) — lowercase snake_case

```
goals ──1:N──▶ bottlenecks ──1:N──▶ tasks
                                        │
                                        ├──▶ execution_dimension_options (priority)
                                        ├──▶ execution_dimension_options (impact)
                                        ├──▶ execution_dimension_options (clarity)
                                        └──▶ execution_dimension_options (time)

app_settings  (key-value pairs, no relations)
```

**Key relationships:**
- `goals` → `bottlenecks`: cascade delete (`goal_id` FK)
- `bottlenecks` → `tasks`: cascade delete (manual via API)
- `tasks.*_option_id` → `execution_dimension_options`: soft reference, no cascade

**`app_settings`** stores flat key-value pairs: `pomodoroDuration`, `dimensionName_*`, and AI API keys (`deepseek_api_key`, `gemini_api_key`).

---

## Data Flow — The Pattern

Every screen follows the same pattern:

### Reading data
```tsx
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const { data: tasks = [], isLoading } = useQuery<Task[]>({
  queryKey: ['tasks', 'pending'],  // cache key, unique per query
  queryFn: async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, goal:goals(id, title), bottleneck:bottlenecks(id, title), ...')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    return (data ?? []) as unknown as Task[]
  },
})
```

### Writing data
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

const createMutation = useMutation({
  mutationFn: async (data: { title: string; goal_id: string }) => {
    const { error } = await supabase.from('goals').insert({ title: data.title, goal_id: data.goal_id })
    if (error) throw new Error(error.message)
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['goals'] })
    toast.success('Goal created')
  },
  onError: () => toast.error('Failed to create goal'),
})
```

**Golden rule — Supabase must be called with `async/await`, not `.then()`:** React Query 5 requires proper `Promise<T>` return types. Always use `async` functions for queryFn/mutationFn. Avoid `.then()` chains.

### Supabase Nested Selects

The app uses Supabase's foreign key joins extensively:
```ts
// Task includes 6 related tables
const TASK_SELECT = '*, goal:goals(id, title), bottleneck:bottlenecks(id, title), priority_option:execution_dimension_options(id, dimension, label, sort_order), impact_option:execution_dimension_options(id, dimension, label, sort_order), clarity_option:execution_dimension_options(id, dimension, label, sort_order), time_option:execution_dimension_options(id, dimension, label, sort_order)'
```

To get counts:
```ts
// goals with counts
supabase.from('goals').select('*, bottlenecks:bottlenecks(count), tasks:tasks(count)')
// Returns: [{ ..., bottlenecks: [{ count: 5 }], tasks: [{ count: 3 }] }]
```

### Important: All table/column names are snake_case

PostgREST (Supabase's REST API) lowercases everything. All tables (`goals`, `tasks`, `bottlenecks`, `execution_dimension_options`, `app_settings`) and columns (`created_at`, `goal_id`, `sort_order`, etc.) use snake_case. This must match in `.from()`, `.select()`, `.order()`, `.eq()`, and data object keys in `.insert()`/`.update()`.

---

## Screen-by-Screen Data Dependencies

| Screen | Reads | Writes |
|---|---|---|---|
| **Today** | `tasks` (pending), dimension options, settings | Complete/skip task |
| **Capture** | `goals`, `bottlenecks`, dimension options | Create `task` |
| **Backlog** | `tasks` (all), `goals`, `bottlenecks`, dimension options | Update/delete `task` |
| **Foundation** | `goals` (with counts), `bottlenecks` (with counts) | Create/update/delete `goal` + `bottleneck` |
| **Coach** | All tables (via ad-hoc fetch, NOT React Query) | Sends messages to AI API |
| **Settings** | `execution_dimension_options`, `app_settings` | Update `app_settings`, CRUD `execution_dimension_options` |

---

## Zustand Store — UI State Only

The store at `src/store/use-app-store.ts` holds ONLY client-side UI state:

| State | Purpose |
|---|---|
| `activeTab` | Which screen is shown (`today` / `capture` / `backlog` / `foundation` / `coach` / `settings`) |
| `pomodoroState` | Timer running state, remaining seconds, active task ID |
| `coachMessages` | In-memory chat history array (NOT persisted) |
| `foundationExpandedGoal` | Which goal card is expanded in Foundation screen |

Data (goals, tasks, bottlenecks, settings, dimensions) lives in Supabase + React Query cache.

---

## AI Coach — Two Providers

The coach supports either **DeepSeek** (recommended) or **Gemini**:

```tsx
// Priority order: DeepSeek first, then Gemini
const deepSeekKey = setting?.data?.value || import.meta.env.VITE_DEEPSEEK_API_KEY
const geminiKey = setting?.data?.value || import.meta.env.VITE_GEMINI_API_KEY

if (deepSeekKey) {
  // POST to api.deepseek.com/v1/chat/completions (OpenAI-compatible format)
} else if (geminiKey) {
  // POST to generativelanguage.googleapis.com (Gemini format)
}
```

API keys are stored in `AppSetting` table (key=`deepseek_api_key` or `gemini_api_key`) or in environment variables. The coach builds a system prompt from ALL user data (goals, tasks, bottlenecks, dimensions) for full context awareness.

---

## Known Gotchas

### 1. Supabase without configuration
`src/lib/supabase.ts` uses a `Proxy` mock when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are empty. This lets the app render without Supabase. The mock returns empty data for all queries. Real operations (insert/update) return errors.

### 2. TypeScript and Supabase
Supabase query builder types don't match the app's interface types. The code uses `as unknown as Task[]` casts after Supabase `.select()` calls. This is intentional but fragile—if the Supabase table schema diverges from `src/types/index.ts`, data will be silently wrong.

### 3. `_count` shape mismatch
Supabase returns counts as `[{ count: number }]` not `{ _count: { ... } }`. The Foundation screen transforms this manually. New screens should follow the same pattern:
```ts
const { data } = await supabase.from('goals').select('*, bottlenecks:bottlenecks(count)')
const goals = data?.map(g => ({
  ...g,
  _count: { bottlenecks: (g.bottlenecks as [{ count: number }])?.[0]?.count ?? 0 }
})) ?? []
```

### 4. Cascade deletes
Supabase tables have `ON DELETE CASCADE` for goals→bottlenecks→tasks. But the Foundation screen also manually deletes tasks before bottlenecks to be safe (defense in depth). If you add a new child table, update the delete logic.

### 5. Dependency array gotcha (Coach screen)
The Coach screen fetches ALL data via ad-hoc `fetchCoachContext()` calls, NOT through React Query. This means `coachMessages` in the Zustand store is the ONLY state tracking conversation history. If the component unmounts, chat history is lost.

---

## Supabase Schema Setup

Run `supabase/schema.sql` in the Supabase SQL Editor. It includes:
1. Table creation (all lowercase snake_case — required by PostgREST)
2. Auto-update triggers for `updated_at`
3. GRANTs for Data API access
4. RLS policies (full access for anon + authenticated)
5. Seed data (default dimension options + settings)

The app is a single-user personal tool (like Swipe.ardy). The Supabase anon key is embedded in the client and RLS allows full CRUD for anon. No auth required.

**Important:** All table names and column names must be lowercase snake_case. PostgREST folds unquoted identifiers to lowercase. Using camelCase (`createdAt`, `Goal`) with quotes will cause 400 errors.

---

## Deployment

GitHub Actions workflow at `.github/workflows/deploy.yml`:
- Triggers on push to `main`
- Builds with Vite
- Injects Supabase/AI credentials from GitHub Secrets
- Deploys static files to GitHub Pages

**Required GitHub Secrets:**
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon/public key
- `DEEPSEEK_API_KEY` or `GEMINI_API_KEY` — (optional) for AI Coach
