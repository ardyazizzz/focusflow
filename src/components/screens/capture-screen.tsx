import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Plus, Loader2, Link2, Pencil, Target, TriangleAlert } from 'lucide-react'
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
import { CUSTOM_LABEL_ICONS } from '@/lib/icons'
import type { Goal, Bottleneck, CustomLabel, CustomLabelOption } from '@/types'

export function CaptureScreen() {
  const queryClient = useQueryClient()
  const setActiveTab = useAppStore((s) => s.setActiveTab)

  const titleRef = useRef<HTMLTextAreaElement>(null)

  const [title, setTitle] = useState('')
  const [goalId, setGoalId] = useState('')
  const [bottleneckId, setBottleneckId] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string[]>>({})
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

  const { data: labelsData } = useQuery<{ labels: CustomLabel[] }>({
    queryKey: ['custom_labels'],
    queryFn: async () => {
      const { data: labels } = await supabase
        .from('custom_labels')
        .select('*')
        .order('sort_order', { ascending: true })

      const { data: options } = await supabase
        .from('custom_label_options')
        .select('*')
        .order('sort_order', { ascending: true })

      const opts = (options ?? []) as CustomLabelOption[]
      const grouped: Record<string, CustomLabelOption[]> = {}
      for (const opt of opts) {
        if (!grouped[opt.label_id]) grouped[opt.label_id] = []
        grouped[opt.label_id].push(opt)
      }

      return {
        labels: (labels ?? []).map((l: CustomLabel) => ({
          ...l,
          options: grouped[l.id] ?? [],
        })),
      }
    },
  })

  const labels = labelsData?.labels ?? []

  const bottlenecksForGoal = allBottlenecks.filter((b) => b.goal_id === goalId)

  function handleGoalChange(val: string) {
    setGoalId(val)
    setBottleneckId('')
  }

  function toggleOption(labelName: string, optionValue: string) {
    setCustomValues((prev) => {
      const current = prev[labelName] ?? []
      if (current.includes(optionValue)) {
        return { ...prev, [labelName]: current.filter((v) => v !== optionValue) }
      }
      return { ...prev, [labelName]: [...current, optionValue] }
    })
  }

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const createMutation = useMutation({
    mutationFn: async (data: {
      title: string
      goal_id: string | null
      bottleneck_id: string | null
      custom_values: Record<string, string[]>
      deadline?: string
      notes?: string
    }) => {
      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          title: data.title.trim(),
          goal_id: data.goal_id || null,
          bottleneck_id: data.bottleneck_id || null,
          custom_values: data.custom_values,
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
      queryClient.invalidateQueries({ queryKey: ['tasks', 'pending'] })
      toast.success('Task captured!')
      resetForm()
      setActiveTab('focus')
    },
    onError: () => {
      toast.error('Failed to create task. Please try again.')
    },
  })

  function resetForm() {
    setTitle('')
    setGoalId('')
    setBottleneckId('')
    setCustomValues({})
    setDeadline('')
    setNotes('')
    setShowMore(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    createMutation.mutate({
      title: title.trim(),
      goal_id: goalId,
      bottleneck_id: bottleneckId,
      custom_values: customValues,
      deadline: deadline || undefined,
      notes: notes.trim() || undefined,
    })
  }

  const isSubmitting = createMutation.isPending
  const isValid = title.trim() !== ''

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
        <div className="grid gap-2 min-w-0">
          <Label htmlFor="capture-title">
            Task Description <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Pencil className="absolute left-4 top-4 size-4 text-primary/60 pointer-events-none" />
            <Textarea
              id="capture-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to focus on?"
              rows={4}
              className="rounded-xl pl-11 pr-4 pt-4 pb-4 resize-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2 min-w-0">
            <Label>Goal</Label>
            <Select value={goalId} onValueChange={handleGoalChange}>
              <SelectTrigger className="w-full rounded-xl h-11">
                <div className="flex items-center gap-2.5">
                  <Target className="size-4 text-primary/60 shrink-0" />
                  <SelectValue placeholder="Select a goal" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {goals.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 min-w-0">
            <Label>Bottleneck</Label>
            <Select
              value={bottleneckId}
              onValueChange={setBottleneckId}
            >
              <SelectTrigger className="w-full rounded-xl h-11">
                <div className="flex items-center gap-2.5">
                  <TriangleAlert className="size-4 text-primary/60 shrink-0" />
                  <SelectValue placeholder="Select a bottleneck" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {bottlenecksForGoal.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {labels.length > 0 && (
          <div className="space-y-4">
            {labels.map((label) => {
              const IconComp = CUSTOM_LABEL_ICONS[label.icon] || CUSTOM_LABEL_ICONS.flag
              const selected = customValues[label.name] ?? []
              return (
                <div key={label.id} className="grid gap-2 min-w-0">
                  <Label className="flex items-center gap-2">
                    <IconComp className="size-4 text-primary/60" />
                    {label.name}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {label.options?.map((opt) => {
                      const isSelected = selected.includes(opt.value)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleOption(label.name, opt.value)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                            isSelected
                              ? 'border-primary/50 bg-primary/5 text-primary font-medium'
                              : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground'
                          }`}
                        >
                          {isSelected && (
                            <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M13.3 4.2a1 1 0 0 1 0 1.4l-6.4 6.4a1 1 0 0 1-1.4 0l-3.2-3.2a1 1 0 1 1 1.4-1.4l2.5 2.5 5.7-5.7a1 1 0 0 1 1.4 1.4z" />
                            </svg>
                          )}
                          {opt.value}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

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
              <div className="grid gap-2 min-w-0">
                <Label htmlFor="capture-deadline">Deadline</Label>
                <Input
                  id="capture-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="rounded-xl h-11"
                />
              </div>

              <div className="grid gap-2 min-w-0">
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
