import { useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Play,
  Pause,
  CheckCircle2,
  SkipForward,
  Plus,
  Timer,
  Target,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/store/use-app-store'
import { supabase } from '@/lib/supabase'
import type { Task, DimensionsData, SettingsData } from '@/types'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
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

const TASK_SELECT = '*, goal:Goal(id, title), bottleneck:Bottleneck(id, title), priorityOption:ExecutionDimensionOption(id, dimension, label, sortOrder), impactOption:ExecutionDimensionOption(id, dimension, label, sortOrder), clarityOption:ExecutionDimensionOption(id, dimension, label, sortOrder), timeOption:ExecutionDimensionOption(id, dimension, label, sortOrder)'

async function fetchTasks(status?: string): Promise<Task[]> {
  let query = supabase.from('Task').select(TASK_SELECT).order('createdAt', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data } = await query
  return (data ?? []) as unknown as Task[]
}

async function fetchDimensions(): Promise<DimensionsData> {
  const { data: options } = await supabase
    .from('ExecutionDimensionOption')
    .select('*')
    .order('dimension', { ascending: true })
    .order('sortOrder', { ascending: true })

  const opts = (options ?? []) as { id: string; dimension: string; label: string; sortOrder: number }[]

  const { data: settings } = await supabase
    .from('AppSetting')
    .select('*')

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
  const { data: settings } = await supabase.from('AppSetting').select('*')
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
    .from('Task')
    .update({ status: 'completed', completedAt: new Date().toISOString() })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to complete task')
  return data as unknown as Task
}

async function skipTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('Task')
    .update({ status: 'pending', completedAt: null })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to skip task')
  return data as unknown as Task
}

export function TodayScreen() {
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

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task completed! Great work.')
      stopPomodoro()
      useAppStore.getState().completePomodoro()
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
      toast.success('Task skipped')
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
          toast.success('Task completed! Great work.')
          stopPomodoro()
          useAppStore.getState().completePomodoro()
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
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {getGreeting()}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tasks.length === 0
            ? 'You have a clear day ahead.'
            : `You have ${tasks.length} pending task${tasks.length !== 1 ? 's' : ''} to focus on.`}
        </p>
      </div>

      {activeTask && (
        <div className="flex flex-col items-center gap-6 rounded-2xl bg-gray-50 px-6 py-10">
          <p className="text-sm font-medium text-muted-foreground">
            Focusing on
          </p>
          <h2 className="text-lg font-semibold text-center max-w-sm">
            {activeTask.title}
          </h2>

          <div className="relative flex items-center justify-center">
            <svg className="size-48 -rotate-90" viewBox="0 0 192 192">
              <circle
                cx="96"
                cy="96"
                r="84"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-gray-200"
              />
              <circle
                cx="96"
                cy="96"
                r="84"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 84}
                strokeDashoffset={
                  2 * Math.PI * 84 * (1 - progressPercent / 100)
                }
                className="text-primary transition-all duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-4xl font-bold tabular-nums tracking-tight">
                {formatTime(pomodoroState.timeRemaining)}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {pomodoroState.isRunning ? 'Focusing' : 'Paused'}
              </span>
            </div>
          </div>

          <div className="w-full max-w-xs">
            <Progress value={progressPercent} className="h-1.5" />
          </div>

          <div className="flex items-center gap-3">
            {pomodoroState.isRunning ? (
              <Button
                variant="outline"
                size="lg"
                onClick={pausePomodoro}
                className="gap-2 rounded-xl"
              >
                <Pause className="size-4" />
                Pause
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                onClick={resumePomodoro}
                className="gap-2 rounded-xl"
              >
                <Play className="size-4" />
                Resume
              </Button>
            )}
            <Button
              size="lg"
              onClick={() => completeMutation.mutate(activeTask.id)}
              disabled={completeMutation.isPending}
              className="gap-2 rounded-xl"
            >
              <CheckCircle2 className="size-4" />
              {completeMutation.isPending ? 'Completing...' : 'Complete'}
            </Button>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-gray-100">
            <Target className="size-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium">No tasks yet</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Capture your first task to get started with focused work.
          </p>
          <Button
            className="mt-6 gap-2 rounded-xl"
            onClick={() => setActiveTab('capture')}
          >
            <Plus className="size-4" />
            Capture a task
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isFocusing = activeTaskId === task.id
            return (
              <div
                key={task.id}
                className={`rounded-xl border px-5 py-4 transition-all ${
                  isFocusing
                    ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border/60 bg-gray-50 hover:bg-gray-100/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium truncate">
                        {task.title}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`text-[11px] px-1.5 py-0 h-5 shrink-0 ${priorityColor(task.priorityOption.label)}`}
                      >
                        {task.priorityOption.label}
                      </Badge>
                      {isFocusing && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] h-5 gap-1">
                          <Timer className="size-3" />
                          {formatTime(pomodoroState.timeRemaining)}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{task.goal.title}</span>
                      <ArrowRight className="size-3" />
                      <span>{task.bottleneck.title}</span>
                    </div>
                  </div>

                  {!isFocusing && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => skipMutation.mutate(task.id)}
                        disabled={skipMutation.isPending}
                        className="text-muted-foreground hover:text-foreground gap-1.5 text-xs h-8 px-2.5"
                      >
                        <SkipForward className="size-3.5" />
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleStartFocus(task.id)}
                        className="gap-1.5 rounded-lg text-xs h-8"
                      >
                        <Play className="size-3.5" />
                        Start Focus
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
