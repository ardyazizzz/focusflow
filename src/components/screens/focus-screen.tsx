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
  RotateCcw,
  Target,
  TriangleAlert,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { preprocessMarkdown } from '@/lib/markdown'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/store/use-app-store'
import { supabase } from '@/lib/supabase'
import type { Task, SettingsData } from '@/types'

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

const TASK_SELECT = '*, goal:goals(id, title), bottleneck:bottlenecks(id, title), custom_values'

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

  const [celebration, setCelebration] = useState(false)
  const completingRef = useRef(false)
  const activeTaskId = pomodoroState.taskId

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', 'pending'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('status', 'pending')
        .order('queue_order', { ascending: true })
        .order('created_at', { ascending: true })
      return (data ?? []) as unknown as Task[]
    },
  })

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data: settings } = await supabase.from('app_settings').select('*')
      const map: Record<string, string> = {}
      if (settings) {
        for (const s of settings) map[s.key] = s.value
      }
      return { pomodoroDuration: Number(map.pomodoroDuration) || 25 }
    },
  })

  const completeTask = useCallback(async (taskId: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString(), queue_order: 9999 })
      .eq('id', taskId)
    if (error) throw new Error(error.message)
  }, [])

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      stopPomodoro()
      completePomodoro()
      setCelebration(true)
      setTimeout(() => setCelebration(false), 1400)
      toast.success('Task complete!')
    },
  })

  const skipMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('tasks')
        .update({ queue_order: 9999 })
        .eq('id', taskId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task moved to end of queue')
    },
  })

  useEffect(() => {
    if (!pomodoroState.isRunning) return
    const id = setInterval(() => { tickPomodoro() }, 1000)
    return () => clearInterval(id)
  }, [pomodoroState.isRunning, tickPomodoro])

  useEffect(() => {
    if (pomodoroState.timeRemaining > 0 || !pomodoroState.isRunning || !activeTaskId) return
    if (completingRef.current) return
    completingRef.current = true
    const taskId = activeTaskId
    stopPomodoro()
    completePomodoro()
    completeTask(taskId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task complete!')
      setCelebration(true)
      setTimeout(() => setCelebration(false), 1400)
    })
  }, [pomodoroState.timeRemaining, pomodoroState.isRunning, activeTaskId, stopPomodoro, completePomodoro, completeTask, queryClient])

  const pomodoroMinutes = settings?.pomodoroDuration ?? 25
  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null
  const topTask = tasks[0] ?? null
  const nowTask = activeTask ?? topTask
  const otherTasks = tasks.filter(t => t.id !== nowTask?.id).slice(0, 3)
  const hasMore = tasks.length - (nowTask ? 1 : 0) - otherTasks.length > 0
  const hour = new Date().getHours()

  if (isLoading) {
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

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{getGreeting()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{getMotivationalText(hour, false)}</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border/60 bg-muted/20">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-background shadow-sm">
            <ListChecks className="size-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium">No tasks in your queue</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Create tasks from the Capture screen or manage them in Backlog.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button variant="default" className="gap-2 rounded-xl" onClick={() => setActiveTab('backlog')}>
              <ListChecks className="size-4" />
              Go to Backlog
            </Button>
            <Button variant="ghost" className="gap-2 rounded-xl" onClick={() => setActiveTab('capture')}>
              <Plus className="size-4" />
              Capture a task
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!nowTask) return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{getGreeting()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{getMotivationalText(hour, true)}</p>
      </div>

      {celebration && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="rounded-full bg-primary/10 px-8 py-6 animate-in fade-in zoom-in duration-300">
            <Sparkles className="size-10 text-primary" />
          </div>
        </div>
      )}

      <div className={`rounded-2xl border-2 p-5 transition-all ${
        activeTask
          ? 'border-primary/30 bg-gradient-to-b from-primary/5 to-background'
          : 'border-primary/20 bg-gradient-to-b from-primary/5 via-background to-background'
      }`}>
        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
          {activeTask ? 'Focusing' : 'Now'}
        </span>

        <div className="mt-3">
          <h3 className="text-lg font-normal leading-snug [&_ul]:list-disc [&_ul]:list-inside [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:my-0.5">
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
        </div>

        {activeTask && (
          <div className="flex flex-col items-center gap-5 pt-3 border-t border-border/40 mt-4">
            <div className="relative flex items-center justify-center">
              <svg className="size-40 -rotate-90" viewBox="0 0 192 192">
                <circle cx="96" cy="96" r="84" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
                <circle cx="96" cy="96" r="84" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 84}
                  strokeDashoffset={2 * Math.PI * 84 * (1 - (pomodoroState.timeRemaining / (pomodoroMinutes * 60)) * 100 / 100)}
                  className="text-primary transition-all duration-1000 ease-linear" />
              </svg>
              <div className="absolute flex flex-col items-center">
                <div className="flex items-center gap-1">
                  <span className="text-3xl font-bold tabular-nums tracking-tight">
                    {formatTime(pomodoroState.timeRemaining)}
                  </span>
                  <button
                    onClick={() => startPomodoro(activeTask.id, pomodoroMinutes)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Reset timer"
                  >
                    <RotateCcw className="size-4" />
                  </button>
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {pomodoroState.isRunning ? 'Focusing' : 'Paused'}
                </span>
              </div>
            </div>
            <Progress value={(pomodoroState.timeRemaining / (pomodoroMinutes * 60)) * 100} className="h-1.5 w-full max-w-xs" />
          </div>
        )}

        <div className={`flex items-center gap-2 ${activeTask ? 'mt-5' : 'mt-4'}`}>
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
              <Button size="sm" onClick={() => completeMutation.mutate(activeTask.id)} className="gap-1.5 rounded-xl flex-1">
                <CheckCircle2 className="size-3.5" /> Complete
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" onClick={() => startPomodoro(nowTask.id, pomodoroMinutes)} className="gap-2 rounded-xl flex-1">
                <Play className="size-4" /> Start Focus
              </Button>
              <Button variant="ghost" size="lg" onClick={() => skipMutation.mutate(nowTask.id)} className="text-muted-foreground hover:text-foreground gap-1.5 rounded-xl">
                <SkipForward className="size-4" /> Skip
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${activeTask ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
          Up next
        </span>
        <div className={`flex flex-col gap-2 transition-opacity ${activeTask ? 'opacity-50' : ''}`}>
          {otherTasks.map((task, i) => (
            <button
              key={task.id}
              onClick={() => {
                if (!activeTask) {
                  startPomodoro(task.id, pomodoroMinutes)
                }
              }}
              className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/30 px-4 py-3 text-left transition-all hover:bg-card hover:border-border"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {i + 2}
              </span>
              <span className="flex-1 min-w-0 truncate text-sm">{task.title}</span>
              <Play className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
        {hasMore && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{tasks.length - 1 - otherTasks.length} more in queue &middot;{' '}
            <button onClick={() => setActiveTab('backlog')} className="text-primary hover:underline font-medium">
              manage in Backlog
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
