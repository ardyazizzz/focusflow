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
    icons.ts                # CUSTOM_LABEL_ICONS map, ICON_PICKER_OPTIONS, fetchCustomLabels(), normalizeCustomValues()
    markdown.ts             # Preprocesses user text into valid markdown

  types/
    index.ts                # All TypeScript interfaces

  store/
    use-app-store.ts        # Zustand store (UI-only: activeTab, pomodoroState, coachMessages, foundationExpandedGoal)

  components/screens/
    focus-screen.tsx        # NOW card (title+goal+bottleneck only) + UP NEXT + Pomodoro timer
    capture-screen.tsx      # Create task form with icons before labels + custom label pills
    backlog-screen.tsx      # Queue management, floating multi-select filters, edit/delete/reopen
    foundation-screen.tsx   # Goals → bottlenecks CRUD with collapsible cards
    coach-screen.tsx        # AI chat with full DB context
    settings-screen.tsx     # Pomodoro, custom labels CRUD, AI Coach config

  components/ui/            # 15 used shadcn/ui components

public/
  favicon.svg               # Sun icon from Remixicon, served as SVG favicon

supabase/
  schema.sql                # Full DB schema with triggers, GRANTs, RLS, seed data

.github/workflows/deploy.yml
vite.config.ts              # @ alias + /focusflow/ base path
```

---

## Data Model (7 Tables, lowercase snake_case)

```
custom_labels ──1:N──▶ custom_label_options  (ON DELETE CASCADE)

goals ──1:N──▶ bottlenecks ──1:N──▶ tasks
                                        │
                                        ├──▶ custom_values (JSONB — flexible labels)
                                        ├──▶ execution_dimension_options (priority only, deprecated)
                                        ├──▶ execution_dimension_options (impact — deprecated)
                                        ├──▶ execution_dimension_options (clarity — deprecated)
                                        └──▶ execution_dimension_options (time — deprecated)

app_settings  (key-value pairs, no relations)
```

### Custom Labels System (replaces old hardcoded 4 dimensions)

**Hardcoded fields (permanent, can't be removed):**
- Task title, Goal, Bottleneck

**Custom labels (flexible, user-defined in Settings):**
- Each label has: name, icon (from Lucide picker), sort_order, options (text values)
- Multi-choice per label (task can have 0, 1, or multiple options selected)
- Values stored in `custom_values` JSONB column on tasks: `{ "Priority": ["P2 - High"], "Energy": ["Medium", "High"] }`
- Default seeded labels: Priority (flag), Impact (zap), Clarity (eye), Time (clock)

### Tasks table key columns

| Column | Type | Notes |
|---|---|---|
| `title` | TEXT | Task description |
| `goal_id` | TEXT FK → goals | **Nullable** (optional) |
| `bottleneck_id` | TEXT FK → bottlenecks | **Nullable** (optional) |
| `custom_values` | JSONB | Stores all custom label values per task `{ "LabelName": ["val1", "val2"] }` |
| `deadline` | TIMESTAMPTZ | Nullable |
| `notes` | TEXT | Nullable |
| `status` | TEXT | `'pending'` or `'completed'` |
| `queue_order` | INTEGER | Default 9999. Focus sorts by this asc. Auto-set to 9999 on complete/skip. |
| `completed_at` | TIMESTAMPTZ | Nullable |

### Important: Old dimension columns (deprecated)

The old columns `priority_option_id`, `impact_option_id`, `clarity_option_id`, `time_option_id` still exist in the tasks table but are **no longer read by the app**. They exist only as a safety net for rollback. All current code reads from `custom_values` instead.
The `execution_dimension_options` table still exists (needed for the old FK references) but is no longer queried by the app.

### custom_labels table

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Auto-generated UUID |
| `name` | TEXT | Display name (e.g., "Priority", "Energy") |
| `icon` | TEXT | Lucide icon name (e.g., "flag", "zap") |
| `sort_order` | INTEGER | Controls display order. `Date.now()/1000` for new labels. |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto (trigger) |

### custom_label_options table

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Auto-generated UUID |
| `label_id` | TEXT FK → custom_labels | ON DELETE CASCADE |
| `value` | TEXT | Option display text (e.g., "P1 - Critical") |
| `sort_order` | INTEGER | Controls option order within label |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto (trigger) |

### app_settings
Flat key-value: `pomodoroDuration`.

All tables: RLS on, GRANT ALL to anon/authenticated, auto-update trigger for `updated_at`.

---

## Bottom Nav Order

Focus → Backlog → Capture → Foundation → Coach → Settings

(The tabs array in `App.tsx` controls both the display order and the icon used.)

---

## Critical Gotchas

### 1. `normalizeCustomValues()` — handle old string format

The migration stored custom_values as strings (`{"Priority": "P2 - High"}`), but the current code expects arrays (`{"Priority": ["P2 - High"]}`). Always use `normalizeCustomValues(task.custom_values)` from `@/lib/icons` when reading custom_values. It converts both formats to arrays:
```ts
function normalizeCustomValues(cv): Record<string, string[]> {
  // string → wraps in array
  // array → keeps as-is
  // null/undefined → empty object
}
```

### 2. Custom values display order follows Settings order

When rendering custom_values in TaskCards, sort by the label's `sort_order` from `custom_labels`, not by `Object.entries()`. The backlog-screen.tsx does this via:
```tsx
.sort(([a], [b]) => labels.findIndex(l => l.name === a) - labels.findIndex(l => l.name === b))
```
This ensures Priority always appears first regardless of JSON insertion order.

### 3. Backlog card layout (top row vs bottom row)

The first 2 custom labels (by sort_order) appear in the **top row** (always visible) alongside the Deadline. The remaining custom labels appear in the **bottom row** (hover-revealed via `opacity-0 group-hover:opacity-100`). Reorder labels in Settings to control which is which.

### 4. Backlog filters (floating multi-select dropdowns)

Custom label filters are NOT standard shadcn Select components. They are custom buttons that open a floating menu with checkbox toggles. Multiple options can be selected per filter. Click-outside-to-close via `mousedown` listener. Status and Queue filters remain standard shadcn Select dropdowns.
The filter bar uses a `useRef<HTMLDivElement>` for click-outside detection.

### 5. Icon picker in Settings

The Settings page uses a Dialog-based icon picker (not the old inline icon rows). Click "Change" button → Dialog opens with a 6-column grid of all 30 Lucide icons → click an icon to select and close.

### 6. Integer overflow on sort_order (new label creation)

`Date.now()` (milliseconds) exceeds PostgreSQL INTEGER max (~2.1B). Must use `Math.floor(Date.now() / 1000)` (seconds) instead. Already fixed in the code — be careful not to revert to `Date.now()`.

### 7. Count queries
Supabase returns `[{ count: number }]`, not `{ _count }`. Transform manually:
```ts
_count: { tasks: (g.tasks as [{ count: number }] | undefined)?.[0]?.count ?? 0 }
```

### 8. All names lowercase snake_case
PostgREST folds unquoted identifiers. Using `Goal` or `createdAt` causes 400 errors. Always use `goals`, `created_at`, `goal_id`, etc.

### 9. Supabase mock
`supabase.ts` uses a `Proxy` mock when no credentials configured. Returns empty data for reads, errors for writes. App renders without Supabase configured.

### 10. Coach state
`coachMessages` is in-memory Zustand state only. Lost on tab switch or remount.

### 11. SelectTrigger press effect
Shadcn Select triggers have `button:active { transform: scale(0.97) }` excluded via CSS: `[data-slot="select-trigger"]:not(:disabled):active { transform: none }`.

### 12. React Query + async functions
Always use `async/await` for queryFn/mutationFn. `.then()` chains return `PromiseLike<T>` which React Query 5 may reject.

### 13. Dialog close behavior
The **Edit Task** dialog (`backlog-screen.tsx`) has `onInteractOutside` and `onEscapeKeyDown` with `preventDefault()` to prevent accidental close. It only closes via the X button, Cancel button, or Save Changes. Other dialogs (Delete confirmation, etc.) have standard behavior.

### 14. Markdown preprocessor
`src/lib/markdown.ts` exports `preprocessMarkdown(text)` which converts user-friendly formatting to valid markdown before rendering:
- Lines starting with `-` are normalized to `- ` (adds space after dash)
- A blank line is inserted before the first list item so markdown parsers recognize it as a list
- Does NOT handle `*` (star) as bullet to avoid conflicting with `**bold**`
- Used in backlog-screen.tsx, focus-screen.tsx, and coach-screen.tsx wherever `ReactMarkdown` renders user text

---

## Shared Utility: `src/lib/icons.ts`

Central map for custom label icons. Key exports:
- `CUSTOM_LABEL_ICONS` — `Record<string, LucideIcon>`, maps icon name string to Lucide component
- `ICON_PICKER_OPTIONS` — `string[]`, list of all available icon names
- `fetchCustomLabels()` — fetches custom_labels + custom_label_options from Supabase and merges them (options attached to each label)
- `normalizeCustomValues()` — normalizes old string format to arrays

---

## Screen-by-Screen Details

### Focus
- Fetches pending tasks ordered by `queue_order` then `created_at`
- NOW card shows only: task title, Goal (with Target icon), Bottleneck (with TriangleAlert icon)
- **No priority badge, no custom labels, no icons** — only hardcoded fields
- UP NEXT list shows: number + title only (no badges)
- Pomodoro timer EMBEDS into the NOW card when Start Focus is clicked
- Timer controls: Pause/Resume, Stop (exits focus mode), Complete
- On complete: `status='completed'`, `completed_at=now()`, `queue_order=9999`
- On skip: `queue_order=9999` (moves to end of queue)
- Celebration overlay on complete, toast + next task slides up automatically
- Empty state: "Go to Backlog" and "Capture a task" buttons

### Capture
- Task Description (Textarea with Pencil icon before label), Goal+Bottleneck side-by-side
- Custom labels rendered as toggle pill buttons (multi-choice per label)
- Icons displayed **before each label text** (not inside inputs/selects)
- Deadline and Notes in "More options" collapsible
- All optional: Goal, Bottleneck, all custom labels, Deadline, Notes
- No "required" fields except Task Description

### Backlog
- **Filters:** Floating multi-select dropdowns for custom labels (Priority, Impact, etc.) + shadcn Select for Status (All/Pending/Completed) and Queue (All/In Queue/Not in Queue). "Clear all" link visible when any filter is active.
- Task cards: queue number badge (clickable), description (markdown), meta rows
- Goal/Bottleneck row with Target/TriangleAlert icons (always visible)
- **Top row (always visible):** First 2 custom labels + Deadline
- **Bottom row (hover-revealed):** Remaining custom labels with `opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity`
- Notes row with StickyNote icon (always visible)
- Action buttons (Complete/Edit/Delete): hover-revealed on desktop, tap-to-reveal on phone
- Completed tasks: strikethrough + Reopen (RotateCcw) button
- **Reopen:** `supabase.from('tasks').update({ status: 'pending', completed_at: null })`
- **Complete:** `supabase.from('tasks').update({ status: 'completed', completed_at: now(), queue_order: 9999 })`
- **Edit dialog:** Description (Textarea), Goal (Select), Bottleneck (Select), custom labels (toggle pills), Deadline (Input), Notes (Textarea). Icons before label names. Does NOT close on outside click/Escape — only via X/Cancel/Save.
- Search bar: filters by `task.title` case-insensitive
- "manage in Backlog" link when >4 tasks shown

### Foundation
- Goals with count badges, collapsible bottlenecks, CRUD for both
- Cascade delete: deletes tasks → bottlenecks → goal manually

### Coach
- Fetches ALL data ad-hoc (not React Query) on each message
- Builds system prompt with goals, bottlenecks, tasks, custom labels
- Task system prompt includes `custom_values` instead of old dimension columns
- Uses `formatCustomValues()` helper to convert custom_values into readable strings
- Supports DeepSeek (API: `api.deepseek.com/v1/chat/completions`) or Gemini (API: `generativelanguage.googleapis.com`)
- API key + provider + model read from localStorage, keys prefixed `focusflow_ai_`

### Settings
- **Pomodoro Timer:** Slider (5–60 min, step 5)
- **Custom Labels:** CRUD for custom_labels and their options. List of label cards, each with name (editable), icon picker (Dialog-based), option pills (add/edit/delete). Up/down reorder buttons. "Add New Label" section with name input + Change icon button + Add button.
- **AI Coach:** Provider selector + model selector + API key input — all saved to localStorage
- **Dialog close behavior:** Option CRUD Dialog has standard close behavior

---

## Design Conventions

### Colors
- Primary: deep teal `#2d6a6e` (light mode), `#4a8a8e` (dark mode)
- Completed: muted foreground + line-through
- In-queue card: subtle teal tint `bg-primary/[0.03]` + `border-primary/20`
- Active filter: `border-primary/40 bg-primary/5 text-primary`

### Icons by context in Backlog
| Context | Icon | Where |
|---|---|---|
| Goal | `Target` | TaskCard meta row |
| Bottleneck | `TriangleAlert` | TaskCard meta row |
| Custom labels | Dynamic (from label definition) | TaskCard rows, filter buttons |
| Deadline | `CalendarDays` | TaskCard top row |
| Notes | `StickyNote` | TaskCard notes row |

### Icons in Capture and Edit Dialog
Icons appear **before each field label** (not inside inputs). The same pattern applies in both Capture and Backlog's Edit Task dialog:
- Description: `Pencil`
- Goal: `Target`
- Bottleneck: `TriangleAlert`
- Deadline: `CalendarDays`
- Notes: `StickyNote`
- Each custom label: dynamic icon from label definition

### Icons in Backlog filter bar
Each custom label filter button shows its icon + label name (or selected value when active).

### Buttons press effect
Global `button:active { transform: scale(0.97) }` applies EXCEPT `[data-slot="select-trigger"]` which has `transform: none`.

### Markdown everywhere
All rendered text (task titles, notes, coach messages) supports markdown via `ReactMarkdown` with `remark-breaks` plugin:
- `**bold**` and `*italic*` — renders as `<strong>` and `<em>`
- `\n` (Enter) — renders as `<br>` line break
- `- item` or `-item` — renders as bullet list (`<ul><li>`). Auto-detected by `preprocessMarkdown()`.
- `line-clamp-2` on notes — limits preview to 2 lines in backlog cards
- `list-disc list-inside` styling applied via Tailwind arbitrary variants

### SelectTrigger width behavior
The `SelectTrigger` component in `select.tsx` has `min-w-0 overflow-hidden` in its base className:
- Without explicit `w-full` or `w-fit`, defaults to content-width
- With `w-full` passed via className, actually becomes full-width
- `overflow-hidden` clips content when field width is constrained
- The `SelectValue` has `min-w-0 break-all truncate` to allow shrinking and proper ellipsis truncation

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
