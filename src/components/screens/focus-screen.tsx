import { useEffect, useCallback, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Play,
  Pause,
  CheckCircle2,
  SkipForward,
  Plus,
  Timer,
  ListChecks,
  Square,
  Sparkles,
  Target,
  TriangleAlert,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { preprocessMarkdown } from '@/lib/markdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/store/use-app-store'
import { supabase } from '@/lib/supabase'
import type { Task, DimensionsData, SettingsData } from '@/types'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 22) return 'Good evening'
  return 'Working late'
}

function getMotivationalText(hour: number, hasTasks: boolean): string {
  if (!hasTasks) return ''
  if (hour < 12) return 'Your top task is ready. Let\u2019s make progress.'
  if (hour < 17) return 'Your top task is ready. Let\u2019s keep going.'
  return 'Your top task is ready. You\u2019ve got this.'
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function priorityColor(label: string): string {
  const lower = label.toLowerCase()
  if (lower.includes('p1') || lower.includes('critical') || lower.includes('urgent'))
    return 'bg-rose-100 text-rose-700 border-rose-200'
  if (lower.includes('p2') || lower.includes('high'))
    return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

const TASK_SELECT = '*, goal:goals(id, title), bottleneck:bottlenecks(id, title), priority_option:execution_dimension_options!tasks_priority_option_id_fkey(id, dimension, label, sort_order), impact_option:execution_dimension_options!tasks_impact_option_id_fkey(id, dimension, label, sort_order), clarity_option:execution_dimension_options!tasks_clarity_option_id_fkey(id, dimension, label, sort_order), time_option:execution_dimension_options!tasks_time_option_id_fkey(id, dimension, label, sort_order)'

async function fetchTasks(status?: string): Promise<Task[]> {
  let query = supabase.from('tasks').select(TASK_SELECT).order('queue_order', { ascending: true }).order('created_at', { ascending: true })
  if (status) query = query.eq('status', status)
  const { data } = await query
  return (data ?? []) as unknown as Task[]
}

async function fetchDimensions(): Promise<DimensionsData> {
  const { data: options } = await supabase
    .from('execution_dimension_options')
    .select('*')
    .order('dimension', { ascending: true })
    .order('sort_order', { ascending: true })

  const opts = (options ?? []) as { id: string; dimension: string; label: string; sort_order: number }[]

  const { data: settings } = await supabase.from('app_settings').select('*')

  const settingsMap: Record<string, string> = {}
  if (settings) {
    for (const s of settings) settingsMap[s.key] = s.value
  }

  const dimensionNames: Record<string, string> = {}
  for (const [key, value] of Object.entries(settingsMap)) {
    if (key.startsWith('dimensionName_')) {
      dimensionNames[key.replace('dimensionName_', '')] = value
    }
  }

  const grouped: Record<string, typeof opts> = {}
  for (const option of opts) {
    if (!grouped[option.dimension]) grouped[option.dimension] = []
    grouped[option.dimension].push(option)
  }

  return { dimensionNames, options: grouped }
}

async function fetchSettings(): Promise<SettingsData> {
  const { data: settings } = await supabase.from('app_settings').select('*')
  const map: Record<string, string> = {}
  if (settings) {
    for (const s of settings) map[s.key] = s.value
  }
  return {
    pomodoroDuration: Number(map.pomodoroDuration) || 25,
    dimensionName_priority: map.dimensionName_priority || 'Priority',
    dimensionName_impact: map.dimensionName_impact || 'Impact',
    dimensionName_clarity: map.dimensionName_clarity || 'Clarity',
    dimensionName_time: map.dimensionName_time || 'Time',
  }
}

async function completeTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString(), queue_order: 9999 })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to complete task')
  return data as unknown as Task
}

async function skipTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ queue_order: 9999 })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to skip task')
  return data as unknown as Task
}

export function FocusScreen() {
  const queryClient = useQueryClient()
  const {
    pomodoroState,
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    stopPomodoro,
    tickPomodoro,
    completePomodoro,
    setActiveTab,
  } = useAppStore()

  const activeTaskId = pomodoroState.taskId
  const completingRef = useRef(false)
  const [celebration, setCelebration] = useState(false)

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['tasks', 'pending'],
    queryFn: () => fetchTasks('pending'),
  })

  const { data: dimensions } = useQuery<DimensionsData>({
    queryKey: ['dimensions'],
    queryFn: fetchDimensions,
  })

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const pomodoroMinutes = settings?.pomodoroDuration ?? 25
  const totalSeconds = pomodoroMinutes * 60
  const progressPercent =
    totalSeconds > 0
      ? ((totalSeconds - pomodoroState.timeRemaining) / totalSeconds) * 100
      : 0

  const now = new Date()
  const hour = now.getHours()
  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null
  const topTask = tasks[0] ?? null
  const nowTask = activeTask ?? topTask
  const otherTasks = tasks.filter(t => t.id !== nowTask?.id).slice(0, 3)
  const hasMore = tasks.length - (nowTask ? 1 : 0) - otherTasks.length > 0

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      stopPomodoro()
      useAppStore.getState().completePomodoro()
      setCelebration(true)
      setTimeout(() => setCelebration(false), 1400)
      toast.success('Task complete! What\u2019s next?')
    },
    onError: () => {
      toast.error('Failed to complete task')
      stopPomodoro()
    },
  })

  const skipMutation = useMutation({
    mutationFn: skipTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast('Task moved to end of queue', { icon: <SkipForward className="size-4" /> })
    },
    onError: () => {
      toast.error('Failed to skip task')
    },
  })

  const handleStartFocus = useCallback(
    (taskId: string) => {
      startPomodoro(taskId, pomodoroMinutes)
    },
    [startPomodoro, pomodoroMinutes]
  )

  useEffect(() => {
    if (!pomodoroState.isRunning) return
    const id = setInterval(() => {
      tickPomodoro()
    }, 1000)
    return () => clearInterval(id)
  }, [pomodoroState.isRunning, tickPomodoro])

  useEffect(() => {
    if (
      pomodoroState.isRunning &&
      pomodoroState.timeRemaining <= 0 &&
      activeTaskId &&
      !completingRef.current
    ) {
      completingRef.current = true
      completeTask(activeTaskId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          stopPomodoro()
          useAppStore.getState().completePomodoro()
          setCelebration(true)
          setTimeout(() => setCelebration(false), 1400)
          toast.success('Time\u2019s up. Task complete.')
        })
        .catch(() => {
          toast.error('Failed to complete task')
          stopPomodoro()
        })
        .finally(() => {
          completingRef.current = false
        })
    }
  }, [pomodoroState.timeRemaining, pomodoroState.isRunning, activeTaskId])

  if (tasksLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  // ── Empty state: no tasks in queue ─────────────────────────────────
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {getGreeting()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your day is clear.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border/60 bg-muted/20">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-background shadow-sm">
            <ListChecks className="size-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium">No tasks in your queue</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Add tasks in <span className="font-medium text-foreground">Backlog</span> and arrange them in the order you want to work.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <Button
              variant="default"
              className="gap-2 rounded-xl"
              onClick={() => setActiveTab('backlog')}
            >
              <ListChecks className="size-4" />
              Go to Backlog
            </Button>
            <Button
              variant="ghost"
              className="gap-2 rounded-xl"
              onClick={() => setActiveTab('capture')}
            >
              <Plus className="size-4" />
              Capture a task
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Normal state: have tasks in queue ──────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {getGreeting()}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {getMotivationalText(hour, true)}
        </p>
      </div>

      {/* Celebration burst overlay (when task completes) */}
      {celebration && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="rounded-full bg-primary/10 px-8 py-6 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3">
              <Sparkles className="size-8 text-primary" />
              <span className="text-lg font-semibold text-primary">Complete!</span>
            </div>
          </div>
        </div>
      )}

      {/* NOW — always visible, timer inside when focusing */}
      {nowTask && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
            {activeTask ? 'Focusing' : 'Now'}
          </span>

          <div className={`rounded-2xl border-2 p-5 transition-all ${
            activeTask
              ? 'border-primary/30 bg-gradient-to-b from-primary/5 to-background'
              : 'border-primary/20 bg-gradient-to-b from-primary/5 via-background to-background'
          }`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-normal leading-snug">
                  <ReactMarkdown remarkPlugins={[remarkBreaks]} components={{ p: ({ children }) => <>{children}</> }}>{preprocessMarkdown(nowTask.title)}</ReactMarkdown>
                </h3>
                {(nowTask.goal?.title || nowTask.bottleneck?.title) && (
                  <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                    {nowTask.goal?.title && (
                      <div className="flex items-start gap-1.5 min-w-0">
                        <Target className="size-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{nowTask.goal.title}</span>
                      </div>
                    )}
                    {nowTask.bottleneck?.title && (
                      <div className="flex items-start gap-1.5 min-w-0">
                        <TriangleAlert className="size-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{nowTask.bottleneck.title}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3">
                  <Badge
                    variant="outline"
                    className={`text-[11px] px-2 py-0.5 ${priorityColor(nowTask.priority_option.label)}`}
                  >
                    {nowTask.priority_option.label}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Timer (only when focusing) */}
            {activeTask && (
              <div className="flex flex-col items-center gap-5 pt-3 border-t border-border/40">
                <div className="relative flex items-center justify-center">
                  <svg className="size-40 -rotate-90" viewBox="0 0 192 192">
                    <circle cx="96" cy="96" r="84" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
                    <circle cx="96" cy="96" r="84" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 84}
                      strokeDashoffset={2 * Math.PI * 84 * (1 - progressPercent / 100)}
                      className="text-primary transition-all duration-1000 ease-linear" />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-3xl font-bold tabular-nums tracking-tight">
                      {formatTime(pomodoroState.timeRemaining)}
                    </span>
                    <span className="mt-1 text-[10px] text-muted-foreground">
                      {pomodoroState.isRunning ? 'Focusing' : 'Paused'}
                    </span>
                  </div>
                </div>
                <Progress value={progressPercent} className="h-1.5 w-full max-w-xs" />
              </div>
            )}

            {/* Action buttons */}
            <div className={`flex items-center gap-2 ${activeTask ? 'mt-5' : ''}`}>
              {activeTask ? (
                <>
                  {pomodoroState.isRunning ? (
                    <Button variant="outline" size="sm" onClick={pausePomodoro} className="gap-1.5 rounded-xl">
                      <Pause className="size-3.5" /> Pause
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={resumePomodoro} className="gap-1.5 rounded-xl">
                      <Play className="size-3.5" /> Resume
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={stopPomodoro} className="gap-1.5 rounded-xl">
                    <Square className="size-3.5" /> Stop
                  </Button>
                  <Button size="sm" onClick={() => completeMutation.mutate(activeTask.id)} disabled={completeMutation.isPending}
                    className="gap-1.5 rounded-xl flex-1">
                    <CheckCircle2 className="size-3.5" />
                    {completeMutation.isPending ? 'Completing...' : 'Complete'}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" onClick={() => handleStartFocus(nowTask.id)} className="gap-2 rounded-xl flex-1">
                    <Play className="size-4" /> Start Focus
                  </Button>
                  <Button variant="ghost" size="lg" onClick={() => skipMutation.mutate(nowTask.id)}
                    disabled={skipMutation.isPending}
                    className="text-muted-foreground hover:text-foreground gap-1.5 rounded-xl">
                    <SkipForward className="size-4" /> Skip
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UP NEXT — always visible, dimmed when focusing */}
      {otherTasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wider transition-opacity ${
            activeTask ? 'text-muted-foreground/50' : 'text-muted-foreground'
          }`}>
            Up next
          </span>
          <div className={`flex flex-col gap-2 transition-opacity ${activeTask ? 'opacity-50' : ''}`}>
            {otherTasks.map((task, i) => (
              <button
                key={task.id}
                onClick={() => handleStartFocus(task.id)}
                className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/30 px-4 py-3 text-left transition-all hover:bg-card hover:border-border"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {i + 2}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm">{task.title}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${priorityColor(task.priority_option.label)}`}>
                  {task.priority_option.label}
                </Badge>
                <Play className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
          {hasMore && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              +{tasks.length - 1 - otherTasks.length} more in queue ·{' '}
              <button onClick={() => setActiveTab('backlog')} className="text-primary hover:underline font-medium">
                manage in Backlog
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
