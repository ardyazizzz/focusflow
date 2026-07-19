import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  CalendarDays,
  StickyNote,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data } = await supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false })
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
    const matchesSearch = task.title
      .toLowerCase()
      .includes(search.toLowerCase())
    const matchesStatus =
      statusFilter === 'all' || task.status === statusFilter
    return matchesSearch && matchesStatus
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

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
  ]

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

      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {statusFilters.map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
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
          filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              dimNames={dimNames}
              onEdit={() => openEdit(task)}
              onDelete={() => setDeletingTask(task)}
              formatDate={formatDate}
            />
          ))
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
                <Label htmlFor="edit-title">Title</Label>
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
  formatDate,
}: {
  task: Task
  dimNames: Record<string, string>
  onEdit: () => void
  onDelete: () => void
  formatDate: (d: string) => string
}) {
  const isCompleted = task.status === 'completed'

  return (
    <div className="group flex flex-col gap-2 rounded-lg border border-border/60 bg-card/50 px-4 py-3 transition-colors hover:bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`text-sm font-medium truncate ${isCompleted ? 'text-muted-foreground line-through' : ''}`}
          >
            {task.title}
          </span>
          <Badge
            className={
              isCompleted
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0'
                : 'bg-amber-100 text-amber-700 border-amber-200 shrink-0'
            }
          >
            {task.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ChevronDown className="size-3" />
          {task.goal?.title ?? '—'}
        </span>
        <span className="inline-flex items-center gap-1">
          <ChevronDown className="size-3 rotate-90" />
          {task.bottleneck?.title ?? '—'}
        </span>
        <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5">
          {task.priority_option.label}
        </Badge>
        {task.deadline && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" />
            {formatDate(task.deadline)}
          </span>
        )}
      </div>

      {task.notes && (
        <p className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1">
          <StickyNote className="size-3 shrink-0" />
          {task.notes}
        </p>
      )}
    </div>
  )
}
