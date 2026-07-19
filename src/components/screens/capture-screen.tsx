import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Plus, Loader2, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/use-app-store'
import { supabase } from '@/lib/supabase'
import type { Goal, Bottleneck, DimensionsData, DimensionOption } from '@/types'

export function CaptureScreen() {
  const queryClient = useQueryClient()
  const setActiveTab = useAppStore((s) => s.setActiveTab)

  const titleRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [goalId, setGoalId] = useState('')
  const [bottleneckId, setBottleneckId] = useState('')
  const [priorityOptionId, setPriorityOptionId] = useState('')
  const [impactOptionId, setImpactOptionId] = useState('')
  const [clarityOptionId, setClarityOptionId] = useState('')
  const [timeOptionId, setTimeOptionId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [showMore, setShowMore] = useState(false)

  const { data: goals = [], isLoading: goalsLoading } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data } = await supabase.from('goals').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const { data: allBottlenecks = [], isLoading: bottlenecksLoading } =
    useQuery<Bottleneck[]>({
      queryKey: ['bottlenecks'],
      queryFn: async () => {
        const { data } = await supabase.from('bottlenecks').select('*, goal:goals(id, title)').order('created_at', { ascending: false })
        return (data ?? []) as unknown as Bottleneck[]
      },
    })

  const { data: dimensions } = useQuery<DimensionsData>({
    queryKey: ['dimensions'],
    queryFn: async () => {
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
    },
  })

  const dimNames = dimensions?.dimensionNames ?? {}
  const dimOptions = dimensions?.options ?? {}

  const bottlenecksForGoal = allBottlenecks.filter((b) => b.goal_id === goalId)
  const priorityOptions = dimOptions['priority'] ?? []
  const impactOptions = dimOptions['impact'] ?? []
  const clarityOptions = dimOptions['clarity'] ?? []
  const timeOptions = dimOptions['time'] ?? []

  function handleGoalChange(val: string) {
    setGoalId(val)
    setBottleneckId('')
  }

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const createMutation = useMutation({
    mutationFn: async (data: {
      title: string
      goal_id: string | null
      bottleneck_id: string | null
      priority_option_id: string
      impact_option_id?: string
      clarity_option_id?: string
      time_option_id?: string
      deadline?: string
      notes?: string
    }) => {
      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          title: data.title.trim(),
          goal_id: data.goal_id || null,
          bottleneck_id: data.bottleneck_id || null,
          priority_option_id: data.priority_option_id,
          impact_option_id: data.impact_option_id || null,
          clarity_option_id: data.clarity_option_id || null,
          time_option_id: data.time_option_id || null,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
          notes: data.notes?.trim() || null,
        })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return task
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task captured!')
      resetForm()
      setActiveTab('today')
    },
    onError: () => {
      toast.error('Failed to create task. Please try again.')
    },
  })

  function resetForm() {
    setTitle('')
    setGoalId('')
    setBottleneckId('')
    setPriorityOptionId('')
    setImpactOptionId('')
    setClarityOptionId('')
    setTimeOptionId('')
    setDeadline('')
    setNotes('')
    setShowMore(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !priorityOptionId) return

    createMutation.mutate({
      title: title.trim(),
      goal_id: goalId,
      bottleneck_id: bottleneckId,
      priority_option_id: priorityOptionId,
      impact_option_id: impactOptionId || undefined,
      clarity_option_id: clarityOptionId || undefined,
      time_option_id: timeOptionId || undefined,
      deadline: deadline || undefined,
      notes: notes.trim() || undefined,
    })
  }

  const isSubmitting = createMutation.isPending
  const isValid =
    title.trim() !== '' &&
    priorityOptionId !== ''

  function dimLabel(key: string): string {
    return dimNames[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
  }

  if (goalsLoading || bottlenecksLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (goals.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Capture a Task
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quickly add a new task to focus on.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-gray-100">
            <Plus className="size-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium">Create a Goal first</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Tasks belong to goals and bottlenecks. Set up your foundation before
            capturing tasks.
          </p>
          <Button
            variant="outline"
            className="mt-6 gap-2 rounded-xl"
            onClick={() => setActiveTab('foundation')}
          >
            <Link2 className="size-4" />
            Go to Foundation
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Capture a Task
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quickly add a new task to focus on.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="capture-title">
            Task Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="capture-title"
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you want to focus on?"
            className="rounded-xl h-11"
          />
        </div>

        <div className="grid gap-2">
          <Label>
            Goal
          </Label>
          <Select value={goalId} onValueChange={handleGoalChange}>
            <SelectTrigger className="w-full rounded-xl h-11">
              <SelectValue placeholder="Select a goal" />
            </SelectTrigger>
            <SelectContent>
              {goals.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>
            Bottleneck
          </Label>
          <Select
            value={bottleneckId}
            onValueChange={setBottleneckId}
          >
            <SelectTrigger className="w-full rounded-xl h-11">
              <SelectValue placeholder="Select a bottleneck" />
              </SelectTrigger>
              <SelectContent>
                {bottlenecksForGoal.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>
            {dimLabel('priority')} <span className="text-destructive">*</span>
          </Label>
          <Select value={priorityOptionId} onValueChange={setPriorityOptionId}>
            <SelectTrigger className="w-full rounded-xl h-11">
              <SelectValue placeholder={`Select ${dimLabel('priority').toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map((opt: DimensionOption) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border border-border/60 bg-gray-50/50">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowMore(!showMore)}
          >
            <span>More options</span>
            {showMore ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>

          {showMore && (
            <div className="flex flex-col gap-5 border-t border-border/40 px-4 py-4">
              <div className="grid gap-2">
                <Label>{dimLabel('impact')}</Label>
                <Select value={impactOptionId} onValueChange={setImpactOptionId}>
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue
                      placeholder={`Select ${dimLabel('impact').toLowerCase()}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {impactOptions.map((opt: DimensionOption) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>{dimLabel('clarity')}</Label>
                <Select
                  value={clarityOptionId}
                  onValueChange={setClarityOptionId}
                >
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue
                      placeholder={`Select ${dimLabel('clarity').toLowerCase()}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {clarityOptions.map((opt: DimensionOption) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>{dimLabel('time')}</Label>
                <Select value={timeOptionId} onValueChange={setTimeOptionId}>
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue
                      placeholder={`Select ${dimLabel('time').toLowerCase()}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map((opt: DimensionOption) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="capture-deadline">Deadline</Label>
                <Input
                  id="capture-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="rounded-xl h-11"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="capture-notes">Notes</Label>
                <Textarea
                  id="capture-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional context..."
                  rows={3}
                  className="rounded-xl resize-none"
                />
              </div>
            </div>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={!isValid || isSubmitting}
          className="w-full gap-2 rounded-xl h-11"
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add Task
        </Button>
      </form>
    </div>
  )
}
