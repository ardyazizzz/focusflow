import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  CalendarDays,
  StickyNote,
  Plus,
  RotateCcw,
  Target,
  Flag,
  Construction,
} from 'lucide-react'
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
import type { Task, Goal, Bottleneck, DimensionsData, DimensionOption } from '@/types'

type StatusFilter = 'all' | 'pending' | 'completed'

interface EditFormState {
  title: string
  goal_id: string
  bottleneck_id: string
  priority_option_id: string
  impact_option_id: string
  clarity_option_id: string
  time_option_id: string
  deadline: string
  notes: string
}

const TASK_SELECT = '*, goal:goals(id, title), bottleneck:bottlenecks(id, title), priority_option:execution_dimension_options!tasks_priority_option_id_fkey(id, dimension, label, sort_order), impact_option:execution_dimension_options!tasks_impact_option_id_fkey(id, dimension, label, sort_order), clarity_option:execution_dimension_options!tasks_clarity_option_id_fkey(id, dimension, label, sort_order), time_option:execution_dimension_options!tasks_time_option_id_fkey(id, dimension, label, sort_order)'

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

export function BacklogScreen() {
  const queryClient = useQueryClient()
  const activeTab = useAppStore((s) => s.activeTab)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [queueFilter, setQueueFilter] = useState<'all' | 'in' | 'out'>('all')
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

  const { data: dimensions } = useQuery<DimensionsData>({
    queryKey: ['dimensions'],
    queryFn: fetchDimensions,
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
      if (data.priority_option_id !== undefined) updateData.priority_option_id = data.priority_option_id
      if (data.impact_option_id !== undefined) updateData.impact_option_id = data.impact_option_id || null
      if (data.clarity_option_id !== undefined) updateData.clarity_option_id = data.clarity_option_id || null
      if (data.time_option_id !== undefined) updateData.time_option_id = data.time_option_id || null
      if (data.deadline !== undefined) updateData.deadline = data.deadline ? new Date(data.deadline).toISOString() : null
      if (data.notes !== undefined) updateData.notes = data.notes || null
      if (data.status !== undefined) updateData.status = data.status

      const { error } = await supabase.from('tasks').update(updateData).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
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
    const matchesPriority = priorityFilter === 'all' || task.priority_option.label === priorityFilter
    const matchesQueue = queueFilter === 'all' ||
      (queueFilter === 'in' ? task.queue_order < 9999 : task.queue_order >= 9999)
    return matchesSearch && matchesStatus && matchesPriority && matchesQueue
  })

  const bottlenecksForGoal = allBottlenecks.filter(
    (b) => b.goal_id === editForm?.goal_id
  )

  const dimNames = dimensions?.dimensionNames ?? {}
  const dimOptions = dimensions?.options ?? {}

  function openEdit(task: Task) {
    setEditingTask(task)
    setEditForm({
      title: task.title,
      goal_id: task.goal_id ?? '',
      bottleneck_id: task.bottleneck_id ?? '',
      priority_option_id: task.priority_option_id,
      impact_option_id: task.impact_option_id ?? '',
      clarity_option_id: task.clarity_option_id ?? '',
      time_option_id: task.time_option_id ?? '',
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
        priority_option_id: editForm.priority_option_id,
        impact_option_id: editForm.impact_option_id || null,
        clarity_option_id: editForm.clarity_option_id || null,
        time_option_id: editForm.time_option_id || null,
        deadline: editForm.deadline || null,
        notes: editForm.notes || null,
      },
    })
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

  const priorityOptions = dimOptions['priority'] ?? []

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
      <div className="flex flex-wrap items-center gap-2">
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-fit min-w-[100px] h-8 text-xs rounded-lg">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {priorityOptions.map((opt: DimensionOption) => (
              <SelectItem key={opt.id} value={opt.label}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-fit min-w-[90px] h-8 text-xs rounded-lg">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={queueFilter} onValueChange={(v) => setQueueFilter(v as 'all' | 'in' | 'out')}>
          <SelectTrigger className="w-fit min-w-[110px] h-8 text-xs rounded-lg">
            <SelectValue placeholder="Queue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in">In Queue</SelectItem>
            <SelectItem value="out">Not in Queue</SelectItem>
          </SelectContent>
        </Select>
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
                    dimNames={dimNames}
                    onEdit={() => openEdit(task)}
                    onDelete={() => setDeletingTask(task)}
                    onReopen={async () => {
                      await supabase.from('tasks').update({ status: 'pending', completed_at: null }).eq('id', task.id)
                      queryClient.invalidateQueries({ queryKey: ['tasks'] })
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
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update the task details below.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-title">Description</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Goal</Label>
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

                <div className="grid gap-2">
                  <Label>Bottleneck</Label>
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
              </div>

              {(['priority', 'impact', 'clarity', 'time'] as const).map(
                (dim) => (
                  <div key={dim} className="grid gap-2">
                    <Label>
                      {dimNames[dim] ?? dim.charAt(0).toUpperCase() + dim.slice(1)}
                    </Label>
                    <Select
                      value={editForm[`${dim}OptionId` as keyof EditFormState] as string}
                      onValueChange={(val) =>
                        setEditForm({
                          ...editForm,
                          [`${dim}OptionId`]: val,
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={`Select ${dimNames[dim] ?? dim}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {dim !== 'priority' && <SelectItem value="">None</SelectItem>}
                        {(dimOptions[dim] ?? []).map(
                          (opt: DimensionOption) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )
              )}

              <div className="grid gap-2">
                <Label htmlFor="edit-deadline">Deadline</Label>
                <Input
                  id="edit-deadline"
                  type="date"
                  value={editForm.deadline}
                  onChange={(e) =>
                    setEditForm({ ...editForm, deadline: e.target.value })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
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
                !editForm?.title.trim() ||
                !editForm?.priority_option_id
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
        <AlertDialogContent>
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
  dimNames,
  onEdit,
  onDelete,
  onReopen,
  formatDate,
  onQueueChange,
}: {
  task: Task
  dimNames: Record<string, string>
  onEdit: () => void
  onDelete: () => void
  onReopen?: () => Promise<void>
  formatDate: (d: string) => string
  onQueueChange?: (order: number) => void
}) {
  const isCompleted = task.status === 'completed'
  const [editingOrder, setEditingOrder] = useState(false)
  const [orderInput, setOrderInput] = useState('')

  const inQueue = task.queue_order < 9999
  const queueNumber = inQueue ? Math.floor(task.queue_order / 100) : null

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
        onQueueChange(9999) // 0 or empty = remove from queue
      }
    }
    setEditingOrder(false)
  }

  return (
    <div className={`group flex flex-col gap-3 rounded-lg border bg-card/30 px-4 py-3.5 transition-colors ${
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
            <p className={`text-sm leading-snug flex-1 ${isCompleted ? 'text-muted-foreground line-through' : ''}`}>
              {task.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
              <span className="sr-only">Edit</span>
            </Button>
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

      {/* Meta row: goal, bottleneck, priority, deadline */}
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
              <Construction className="size-3" />
              {task.bottleneck.title}
            </span>
          )}
        </div>
      )}

      {/* Bottom row: priority + deadline */}
      {(task.priority_option.label || task.deadline) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-10 text-xs text-muted-foreground">
          {task.priority_option.label && (
            <span className="inline-flex items-center gap-1.5">
              <Flag className="size-3" />
              {task.priority_option.label}
            </span>
          )}
          {task.priority_option.label && task.deadline && (
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

      {/* Notes */}
      {task.notes && (
        <div className="flex items-start gap-1.5 pl-10 text-xs text-muted-foreground">
          <StickyNote className="size-3 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{task.notes}</span>
        </div>
      )}
    </div>
  )
}
