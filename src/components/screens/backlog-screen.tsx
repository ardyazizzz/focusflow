import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Search,
  Pencil,
  Trash2,
  CalendarDays,
  StickyNote,
  Plus,
  RotateCcw,
  CheckCircle2,
  Target,
  TriangleAlert,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { preprocessMarkdown } from '@/lib/markdown'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/use-app-store'
import { supabase } from '@/lib/supabase'
import { CUSTOM_LABEL_ICONS, fetchCustomLabels, normalizeCustomValues } from '@/lib/icons'
import type { Task, Goal, Bottleneck, CustomLabel, CustomLabelOption } from '@/types'

type StatusFilter = 'all' | 'pending' | 'completed'

interface EditFormState {
  title: string
  goal_id: string
  bottleneck_id: string
  custom_values: Record<string, string[]>
  deadline: string
  notes: string
}

const TASK_SELECT = '*, goal:goals(id, title), bottleneck:bottlenecks(id, title), custom_values'

export function BacklogScreen() {
  const queryClient = useQueryClient()
  const activeTab = useAppStore((s) => s.activeTab)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [labelFilters, setLabelFilters] = useState<Record<string, string[]>>({})
  const [queueFilter, setQueueFilter] = useState<'all' | 'in' | 'out'>('all')
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data } = await supabase.from('tasks').select(TASK_SELECT).order('queue_order', { ascending: true }).order('created_at', { ascending: false })
      return (data ?? []) as unknown as Task[]
    },
    enabled: activeTab === 'backlog',
  })

  const { data: labels = [] } = useQuery<CustomLabel[]>({
    queryKey: ['custom_labels'],
    queryFn: fetchCustomLabels,
    enabled: activeTab === 'backlog',
  })

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data } = await supabase.from('goals').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: activeTab === 'backlog',
  })

  const { data: allBottlenecks = [] } = useQuery<Bottleneck[]>({
    queryKey: ['bottlenecks'],
    queryFn: async () => {
      const { data } = await supabase.from('bottlenecks').select('*, goal:goals(id, title)').order('created_at', { ascending: false })
      return (data ?? []) as unknown as Bottleneck[]
    },
    enabled: activeTab === 'backlog',
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
      const updateData: Record<string, unknown> = {}
      if (data.title !== undefined) updateData.title = data.title
      if (data.goal_id !== undefined) updateData.goal_id = data.goal_id
      if (data.bottleneck_id !== undefined) updateData.bottleneck_id = data.bottleneck_id
      if (data.custom_values !== undefined) updateData.custom_values = data.custom_values
      if (data.deadline !== undefined) updateData.deadline = data.deadline ? new Date(data.deadline).toISOString() : null
      if (data.notes !== undefined) updateData.notes = data.notes || null
      if (data.status !== undefined) updateData.status = data.status

      const { error } = await supabase.from('tasks').update(updateData).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'pending'] })
      toast.success('Task updated')
      setEditingTask(null)
      setEditForm(null)
    },
    onError: () => {
      toast.error('Failed to update task')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task deleted')
      setDeletingTask(null)
    },
    onError: () => {
      toast.error('Failed to delete task')
    },
  })

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter
    const matchesQueue = queueFilter === 'all' ||
      (queueFilter === 'in' ? task.queue_order < 9999 : task.queue_order >= 9999)
    const cv = normalizeCustomValues(task.custom_values)
    const matchesLabels = Object.entries(labelFilters).every(([labelName, filterVals]) => {
      if (filterVals.length === 0) return true
      const taskVals = cv[labelName] ?? []
      return filterVals.some((v) => taskVals.includes(v))
    })
    return matchesSearch && matchesStatus && matchesLabels && matchesQueue
  })

  const bottlenecksForGoal = allBottlenecks.filter(
    (b) => b.goal_id === editForm?.goal_id
  )

  function openEdit(task: Task) {
    setEditingTask(task)
    setEditForm({
      title: task.title,
      goal_id: task.goal_id ?? '',
      bottleneck_id: task.bottleneck_id ?? '',
      custom_values: normalizeCustomValues(task.custom_values),
      deadline: task.deadline
        ? new Date(task.deadline).toISOString().split('T')[0]
        : '',
      notes: task.notes ?? '',
    })
  }

  function handleEditSubmit() {
    if (!editingTask || !editForm) return
    updateMutation.mutate({
      id: editingTask.id,
      data: {
        title: editForm.title,
        goal_id: editForm.goal_id || null,
        bottleneck_id: editForm.bottleneck_id || null,
        custom_values: editForm.custom_values,
        deadline: editForm.deadline || null,
        notes: editForm.notes || null,
      },
    })
  }

  function toggleEditOption(labelName: string, value: string) {
    if (!editForm) return
    const current = editForm.custom_values[labelName] ?? []
    if (current.includes(value)) {
      setEditForm({
        ...editForm,
        custom_values: {
          ...editForm.custom_values,
          [labelName]: current.filter((v) => v !== value),
        },
      })
    } else {
      setEditForm({
        ...editForm,
        custom_values: {
          ...editForm.custom_values,
          [labelName]: [...current, value],
        },
      })
    }
  }

  function handleDelete() {
    if (!deletingTask) return
    deleteMutation.mutate(deletingTask.id)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setOpenFilter(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleLabelFilter(labelName: string, value: string) {
    setLabelFilters((prev) => {
      const current = prev[labelName] ?? []
      if (current.includes(value)) {
        const updated = current.filter((v) => v !== value)
        const next = { ...prev, [labelName]: updated }
        if (updated.length === 0) delete next[labelName]
        return next
      }
      return { ...prev, [labelName]: [...current, value] }
    })
  }

  function clearLabelFilter(labelName: string) {
    setLabelFilters((prev) => {
      const next = { ...prev }
      delete next[labelName]
      return next
    })
  }

  const hasAnyFilter = Object.keys(labelFilters).length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Backlog</h2>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* ── Filter pills ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2" ref={filterRef}>
        {labels.map((label) => {
          const IconComp = CUSTOM_LABEL_ICONS[label.icon] || CUSTOM_LABEL_ICONS.flag
          const selected = labelFilters[label.name] ?? []
          const isActive = selected.length > 0
          const btnLabel = isActive
            ? selected.length === 1
              ? selected[0]
              : `${selected[0]} +${selected.length - 1}`
            : label.name
          return (
            <div className="relative" key={label.id}>
              <button
                onClick={() => setOpenFilter(openFilter === label.name ? null : label.name)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  isActive
                    ? 'border-primary/40 bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-border-hover'
                }`}
              >
                <IconComp className="size-3" />
                <span>{btnLabel}</span>
              </button>

              {openFilter === label.name && (
                <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-card border border-border rounded-lg shadow-lg p-1.5">
                  {label.options?.map((opt) => {
                    const checked = selected.includes(opt.value)
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleLabelFilter(label.name, opt.value)}
                        className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                          checked
                            ? 'bg-primary/5 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        <span className={`flex size-3.5 items-center justify-center rounded-[3px] border transition-colors ${
                          checked ? 'bg-primary border-primary' : 'border-border'
                        }`}>
                          {checked && (
                            <svg className="size-2.5 text-primary-foreground" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M13.3 4.2a1 1 0 0 1 0 1.4l-6.4 6.4a1 1 0 0 1-1.4 0l-3.2-3.2a1 1 0 1 1 1.4-1.4l2.5 2.5 5.7-5.7a1 1 0 0 1 1.4 1.4z" />
                            </svg>
                          )}
                        </span>
                        {opt.value}
                      </button>
                    )
                  })}
                  {isActive && (
                    <button
                      onClick={() => clearLabelFilter(label.name)}
                      className="w-full text-left px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border-t border-border/40 mt-1 pt-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-fit min-w-[90px] h-8 text-xs rounded-lg">
            <SelectValue placeholder="Status">{statusFilter === 'all' ? 'Status' : statusFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={queueFilter} onValueChange={(v) => setQueueFilter(v as 'all' | 'in' | 'out')}>
          <SelectTrigger className="w-fit min-w-[110px] h-8 text-xs rounded-lg">
            <SelectValue placeholder="Queue">
              {queueFilter === 'all' ? 'Queue' : queueFilter === 'in' ? 'In Queue' : 'Not in Queue'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in">In Queue</SelectItem>
            <SelectItem value="out">Not in Queue</SelectItem>
          </SelectContent>
        </Select>

        {hasAnyFilter && (
          <button
            onClick={() => setLabelFilters({})}
            className="text-xs text-primary hover:underline font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[calc(100vh-260px)] min-h-0 overflow-y-auto pr-1 space-y-2">
        {tasksLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">No tasks found</p>
            <p className="text-xs mt-1">
              {search ? 'Try a different search term' : 'Create tasks from the Capture screen'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task, i) => {
              const prevQueued = i > 0 && filteredTasks[i-1].queue_order < 9999
              const thisUnqueued = task.queue_order >= 9999
              return (
                <React.Fragment key={task.id}>
                  {prevQueued && thisUnqueued && <Separator className="my-2" />}
                  <TaskCard
                    key={task.id}
                    task={task}
                    labels={labels}
                    onEdit={() => openEdit(task)}
                    onDelete={() => setDeletingTask(task)}
                    onReopen={async () => {
                      await supabase.from('tasks').update({ status: 'pending', completed_at: null }).eq('id', task.id)
                      queryClient.invalidateQueries({ queryKey: ['tasks'] })
                    }}
                    onComplete={async () => {
                      await supabase.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString(), queue_order: 9999 }).eq('id', task.id)
                      queryClient.invalidateQueries({ queryKey: ['tasks'] })
                      toast.success('Task completed')
                    }}
                    formatDate={formatDate}
                    onQueueChange={async (newOrder) => {
                      queryClient.setQueryData(['tasks'], (old: Task[] | undefined) =>
                        old?.map(t => t.id === task.id ? { ...t, queue_order: newOrder } : t) ?? []
                      )
                      await supabase.from('tasks').update({ queue_order: newOrder }).eq('id', task.id)
                      queryClient.invalidateQueries({ queryKey: ['tasks'] })
                    }}
                  />
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!editingTask}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTask(null)
            setEditForm(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update the task details below.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2 min-w-0">
                <Label htmlFor="edit-title" className="flex items-center gap-1.5">
                  <Pencil className="size-3.5 text-primary/60 shrink-0" />
                  Description</Label>
                <Textarea
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                  placeholder="What do you want to focus on?"
                  rows={4}
                  className="rounded-xl resize-none"
                />
              </div>

              <div className="grid gap-2 min-w-0">
                <Label className="flex items-center gap-1.5">
                  <Target className="size-3.5 text-primary/60 shrink-0" />
                  Goal</Label>
                <Select
                  value={editForm.goal_id}
                  onValueChange={(val) =>
                    setEditForm({
                      ...editForm,
                      goal_id: val,
                      bottleneck_id: '',
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select goal" />
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
                <Label className="flex items-center gap-1.5">
                  <TriangleAlert className="size-3.5 text-primary/60 shrink-0" />
                  Bottleneck</Label>
                <Select
                  value={editForm.bottleneck_id}
                  onValueChange={(val) =>
                    setEditForm({ ...editForm, bottleneck_id: val })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select bottleneck" />
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

              {labels.map((label) => {
                const IconComp = CUSTOM_LABEL_ICONS[label.icon] || CUSTOM_LABEL_ICONS.flag
                const selected = editForm.custom_values[label.name] ?? []
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
                            onClick={() => toggleEditOption(label.name, opt.value)}
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

              <div className="grid gap-2 min-w-0">
                <Label htmlFor="edit-deadline" className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-primary/60 shrink-0" />
                  Deadline</Label>
                <Input
                  id="edit-deadline"
                  type="date"
                  value={editForm.deadline}
                  onChange={(e) =>
                    setEditForm({ ...editForm, deadline: e.target.value })
                  }
                />
              </div>

              <div className="grid gap-2 min-w-0">
                <Label htmlFor="edit-notes" className="flex items-center gap-1.5">
                  <StickyNote className="size-3.5 text-primary/60 shrink-0" />
                  Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingTask(null)
                setEditForm(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={
                updateMutation.isPending ||
                !editForm?.title.trim()
              }
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingTask}
        onOpenChange={(open) => !open && setDeletingTask(null)}
      >
        {/* @ts-expect-error AlertDialogContent inherits Dialog's onInteractOutside and onEscapeKeyDown */}
        <AlertDialogContent onInteractOutside={(e: Event) => e.preventDefault()} onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingTask?.title}&rdquo;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TaskCard({
  task,
  labels,
  onEdit,
  onDelete,
  onReopen,
  onComplete,
  formatDate,
  onQueueChange,
}: {
  task: Task
  labels: CustomLabel[]
  onEdit: () => void
  onDelete: () => void
  onReopen?: () => Promise<void>
  onComplete?: () => Promise<void>
  formatDate: (d: string) => string
  onQueueChange?: (order: number) => void
}) {
  const isCompleted = task.status === 'completed'
  const [editingOrder, setEditingOrder] = useState(false)
  const [orderInput, setOrderInput] = useState('')

  const inQueue = task.queue_order < 9999
  const queueNumber = inQueue ? Math.floor(task.queue_order / 100) : null

  const cv = normalizeCustomValues(task.custom_values)
  const labelEntries = Object.entries(cv)
    .filter(([, vals]) => vals.length > 0)
    .sort(([a], [b]) => labels.findIndex((l) => l.name === a) - labels.findIndex((l) => l.name === b))

  function handleQueueClick() {
    setOrderInput(queueNumber?.toString() ?? '')
    setEditingOrder(true)
  }

  function handleQueueSave() {
    const val = parseInt(orderInput, 10)
    if (onQueueChange) {
      if (!isNaN(val) && val > 0) {
        onQueueChange(val * 100)
      } else {
        onQueueChange(9999)
      }
    }
    setEditingOrder(false)
  }

  return (
    <div tabIndex={0} className={`group focus:outline-none flex flex-col gap-3 rounded-lg border bg-card/30 px-4 py-3.5 transition-colors ${
      inQueue ? 'border-primary/20 bg-primary/[0.03]' : 'border-border/60 hover:bg-card/60'
    }`}>
      {/* Top row: queue badge, description, action buttons */}
      <div className="flex items-start gap-3">
        {editingOrder ? (
          <input
            autoFocus
            type="number"
            min="1"
            value={orderInput}
            onChange={(e) => setOrderInput(e.target.value)}
            onBlur={handleQueueSave}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQueueSave(); if (e.key === 'Escape') setEditingOrder(false) }}
            className="shrink-0 w-9 h-7 text-xs text-center rounded-md border border-primary bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <button
            onClick={handleQueueClick}
            className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-xs font-medium transition-colors ${
              inQueue
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-dashed border-border'
            }`}
            title="Click to set queue position"
          >
            {inQueue ? queueNumber : <Plus className="size-3.5" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className={`text-sm leading-snug flex-1 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:my-0.5 ${isCompleted ? 'text-muted-foreground line-through' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkBreaks]} components={{ p: ({ children }) => <>{children}</> }}>{preprocessMarkdown(task.title)}</ReactMarkdown>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
          {isCompleted ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={onReopen}
            >
              <RotateCcw className="size-3.5" />
              <span className="sr-only">Reopen</span>
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                onClick={onComplete}
              >
                <CheckCircle2 className="size-3.5" />
                <span className="sr-only">Complete</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
                <span className="sr-only">Edit</span>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </div>

      {/* Meta row: goal & bottleneck */}
      {(task.goal?.title || task.bottleneck?.title) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-10 text-xs text-muted-foreground">
          {task.goal?.title && (
            <span className="inline-flex items-center gap-1">
              <Target className="size-3" />
              {task.goal.title}
            </span>
          )}
          {task.goal?.title && task.bottleneck?.title && (
            <span className="text-border">›</span>
          )}
          {task.bottleneck?.title && (
            <span className="inline-flex items-center gap-1">
              <TriangleAlert className="size-3" />
              {task.bottleneck.title}
            </span>
          )}
        </div>
      )}

      {/* Top row: first 2 custom labels + deadline (always visible) */}
      {(labelEntries.length > 0 || task.deadline) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-10 text-xs text-muted-foreground">
          {labelEntries.slice(0, 2).map(([labelName, vals]) => {
            const labelDef = labels.find((l) => l.name === labelName)
            const IconComp = labelDef ? (CUSTOM_LABEL_ICONS[labelDef.icon] || CUSTOM_LABEL_ICONS.flag) : null
            return vals.map((val) => (
              <span key={`${labelName}-${val}`} className="inline-flex items-center gap-1.5">
                {IconComp && <IconComp className="size-3 shrink-0" />}
                {val}
              </span>
            ))
          })}
          {labelEntries.slice(0, 2).length > 0 && task.deadline && (
            <span className="text-border">·</span>
          )}
          {task.deadline && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3" />
              {formatDate(task.deadline)}
            </span>
          )}
        </div>
      )}

      {/* Bottom row: remaining custom labels (hover-revealed) */}
      {labelEntries.length > 2 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-10 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
          {labelEntries.slice(2).map(([labelName, vals]) => {
            const labelDef = labels.find((l) => l.name === labelName)
            const IconComp = labelDef ? (CUSTOM_LABEL_ICONS[labelDef.icon] || CUSTOM_LABEL_ICONS.flag) : null
            return vals.map((val) => (
              <span key={`${labelName}-${val}`} className="inline-flex items-center gap-1.5">
                {IconComp && <IconComp className="size-3 shrink-0" />}
                {val}
              </span>
            ))
          })}
        </div>
      )}

      {/* Notes */}
      {task.notes && (
        <div className="flex items-start gap-1.5 pl-10 text-xs text-muted-foreground">
          <StickyNote className="size-3 shrink-0 mt-0.5" />
          <div className="line-clamp-2 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:my-0.5">
            <ReactMarkdown remarkPlugins={[remarkBreaks]} components={{ p: ({ children }) => <>{children}</> }}>{preprocessMarkdown(task.notes)}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
