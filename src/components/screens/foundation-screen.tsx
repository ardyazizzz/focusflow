import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  GripVertical,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useAppStore } from '@/store/use-app-store'
import { supabase } from '@/lib/supabase'
import type { Goal, Bottleneck } from '@/types'

interface GoalWithCount extends Goal {
  _count: { bottlenecks: number; tasks: number }
}

type GoalRow = { id: string; title: string; description: string | null; created_at: string; updated_at: string; bottlenecks?: unknown[]; tasks?: unknown[]; [key: string]: unknown }

async function fetchGoals(): Promise<GoalWithCount[]> {
  const { data } = await supabase
    .from('goals')
    .select('*, bottlenecks:bottlenecks(count), tasks:tasks(count)')
    .order('created_at', { ascending: false })
  const raw = (data ?? []) as GoalRow[]
  return raw.map((g: GoalRow) => ({
    id: g.id,
    title: g.title,
    description: g.description ?? null,
    created_at: g.created_at,
    updated_at: g.updated_at,
    _count: {
      bottlenecks: (g.bottlenecks as [{ count: number }] | undefined)?.[0]?.count ?? 0,
      tasks: (g.tasks as [{ count: number }] | undefined)?.[0]?.count ?? 0,
    },
  }))
}

export function FoundationScreen() {
  const queryClient = useQueryClient()
  const activeTab = useAppStore((s) => s.activeTab)
  const expandedGoalId = useAppStore((s) => s.foundationExpandedGoal)
  const setExpandedGoalId = useAppStore((s) => s.setFoundationExpandedGoal)

  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalDesc, setNewGoalDesc] = useState('')

  const [editingGoal, setEditingGoal] = useState<GoalWithCount | null>(null)
  const [goalEditTitle, setGoalEditTitle] = useState('')
  const [goalEditDesc, setGoalEditDesc] = useState('')
  const [deletingGoal, setDeletingGoal] = useState<GoalWithCount | null>(null)

  const [bnForms, setBnForms] = useState<Record<string, string>>({})
  const [editingBn, setEditingBn] = useState<Bottleneck | null>(null)
  const [bnEditTitle, setBnEditTitle] = useState('')
  const [bnEditDesc, setBnEditDesc] = useState('')
  const [deletingBn, setDeletingBn] = useState<Bottleneck | null>(null)

  const { data: goals = [], isLoading: goalsLoading } = useQuery<GoalWithCount[]>({
    queryKey: ['goals'],
    queryFn: fetchGoals,
    enabled: activeTab === 'foundation',
  })

  const { data: bottlenecks = [], isLoading: bnsLoading } = useQuery<Bottleneck[]>({
    queryKey: ['bottlenecks'],
    queryFn: async () => {
      const { data } = await supabase.from('bottlenecks').select('*, goal:goals(id, title), tasks:tasks(count)').order('created_at', { ascending: false })
      const raw = (data ?? []) as ({ id: string; title: string; description: string | null; goal_id: string; createdAt: string; updatedAt: string; goal: { id: string; title: string }; tasks?: unknown[] })[]
      return raw.map(b => ({
        ...b,
        description: b.description ?? null,
        _count: { tasks: ((b.tasks as [{ count: number }] | undefined)?.[0]?.count ?? 0) },
      })) as unknown as Bottleneck[]
    },
    enabled: activeTab === 'foundation',
  })

  const createGoalMutation = useMutation({
    mutationFn: async (data: { title: string; description: string | null }) => {
      const { error } = await supabase.from('goals').insert({ title: data.title, description: data.description })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success('Goal created')
      setNewGoalTitle('')
      setNewGoalDesc('')
    },
    onError: () => toast.error('Failed to create goal'),
  })

  const updateGoalMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { title: string; description: string | null } }) => {
      const { error } = await supabase.from('goals').update({ title: data.title, description: data.description }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success('Goal updated')
      setEditingGoal(null)
    },
    onError: () => toast.error('Failed to update goal'),
  })

  const deleteGoalMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: taskError } = await supabase.from('tasks').delete().eq('goal_id', id)
      if (taskError) throw new Error(taskError.message)

      const { error: bnError } = await supabase.from('bottlenecks').delete().eq('goal_id', id)
      if (bnError) throw new Error(bnError.message)

      const { error } = await supabase.from('goals').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['bottlenecks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Goal deleted')
      setDeletingGoal(null)
      if (expandedGoalId === id) setExpandedGoalId(null)
    },
    onError: () => toast.error('Failed to delete goal'),
  })

  const createBnMutation = useMutation({
    mutationFn: async (data: { title: string; description: string | null; goal_id: string }) => {
      const { error } = await supabase.from('bottlenecks').insert({ title: data.title, description: data.description, goal_id: data.goal_id })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bottlenecks'] })
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success('Bottleneck created')
      setBnForms((prev) => ({ ...prev, [variables.goal_id]: '' }))
    },
    onError: () => toast.error('Failed to create bottleneck'),
  })

  const updateBnMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { title: string; description: string | null } }) => {
      const { error } = await supabase.from('bottlenecks').update({ title: data.title, description: data.description }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlenecks'] })
      toast.success('Bottleneck updated')
      setEditingBn(null)
    },
    onError: () => toast.error('Failed to update bottleneck'),
  })

  const deleteBnMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: taskError } = await supabase.from('tasks').delete().eq('bottleneck_id', id)
      if (taskError) throw new Error(taskError.message)

      const { error } = await supabase.from('bottlenecks').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlenecks'] })
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Bottleneck deleted')
      setDeletingBn(null)
    },
    onError: () => toast.error('Failed to delete bottleneck'),
  })

  function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!newGoalTitle.trim()) return
    createGoalMutation.mutate({
      title: newGoalTitle.trim(),
      description: newGoalDesc.trim() || null,
    })
  }

  function openEditGoal(goal: GoalWithCount) {
    setEditingGoal(goal)
    setGoalEditTitle(goal.title)
    setGoalEditDesc(goal.description ?? '')
  }

  function handleUpdateGoal() {
    if (!editingGoal || !goalEditTitle.trim()) return
    updateGoalMutation.mutate({
      id: editingGoal.id,
      data: {
        title: goalEditTitle.trim(),
        description: goalEditDesc.trim() || null,
      },
    })
  }

  function handleDeleteGoal() {
    if (!deletingGoal) return
    deleteGoalMutation.mutate(deletingGoal.id)
  }

  function handleCreateBn(goalId: string, e: React.FormEvent) {
    e.preventDefault()
    const title = bnForms[goalId]?.trim()
    if (!title) return
    createBnMutation.mutate({
      title,
      description: null,
      goal_id: goalId,
    })
  }

  function openEditBn(bn: Bottleneck) {
    setEditingBn(bn)
    setBnEditTitle(bn.title)
    setBnEditDesc(bn.description ?? '')
  }

  function handleUpdateBn() {
    if (!editingBn || !bnEditTitle.trim()) return
    updateBnMutation.mutate({
      id: editingBn.id,
      data: {
        title: bnEditTitle.trim(),
        description: bnEditDesc.trim() || null,
      },
    })
  }

  function handleDeleteBn() {
    if (!deletingBn) return
    deleteBnMutation.mutate(deletingBn.id)
  }

  function getBottlenecksForGoal(goal_id: string) {
    return bottlenecks.filter((b) => b.goal_id === goal_id)
  }

  const isLoading = goalsLoading || bnsLoading

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Foundation</h2>
        <p className="text-xs text-muted-foreground">
          {goals.length} goal{goals.length !== 1 ? 's' : ''}
        </p>
      </div>

      <form
        onSubmit={handleCreateGoal}
        className="flex flex-col sm:flex-row gap-2"
      >
        <div className="flex flex-1 gap-2">
          <Input
            placeholder="New goal title..."
            value={newGoalTitle}
            onChange={(e) => setNewGoalTitle(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Description (optional)"
            value={newGoalDesc}
            onChange={(e) => setNewGoalDesc(e.target.value)}
            className="flex-1 hidden sm:block"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={!newGoalTitle.trim() || createGoalMutation.isPending}
        >
          <Plus className="size-3.5" />
          Add Goal
        </Button>
      </form>

      <div className="max-h-[calc(100vh-280px)] min-h-0 overflow-y-auto pr-1 space-y-2">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">No goals yet</p>
            <p className="text-xs mt-1">
              Create your first goal above to get started
            </p>
          </div>
        ) : (
          goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              bottlenecks={getBottlenecksForGoal(goal.id)}
              isExpanded={expandedGoalId === goal.id}
              onToggle={() =>
                setExpandedGoalId(
                  expandedGoalId === goal.id ? null : goal.id
                )
              }
              onEdit={() => openEditGoal(goal)}
              onDelete={() => setDeletingGoal(goal)}
              onBnFormChange={(goalId, value) =>
                setBnForms((prev) => ({ ...prev, [goalId]: value }))
              }
              onBnSubmit={handleCreateBn}
              onBnEdit={openEditBn}
              onBnDelete={(bn) => setDeletingBn(bn)}
              bnFormValue={bnForms[goal.id] ?? ''}
              bnCreating={createBnMutation.isPending}
            />
          ))
        )}
      </div>

      <Dialog
        open={!!editingGoal}
        onOpenChange={(open) => !open && setEditingGoal(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Goal</DialogTitle>
            <DialogDescription>
              Update the goal details below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="goal-edit-title">Title</Label>
              <Input
                id="goal-edit-title"
                value={goalEditTitle}
                onChange={(e) => setGoalEditTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="goal-edit-desc">Description</Label>
              <Textarea
                id="goal-edit-desc"
                value={goalEditDesc}
                onChange={(e) => setGoalEditDesc(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGoal(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateGoal}
              disabled={
                updateGoalMutation.isPending || !goalEditTitle.trim()
              }
            >
              {updateGoalMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingGoal}
        onOpenChange={(open) => !open && setDeletingGoal(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Goal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingGoal?.title}
              &rdquo;? This will also delete all its bottlenecks and associated
              tasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGoal}
              disabled={deleteGoalMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteGoalMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!editingBn}
        onOpenChange={(open) => !open && setEditingBn(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Bottleneck</DialogTitle>
            <DialogDescription>
              Update the bottleneck details below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="bn-edit-title">Title</Label>
              <Input
                id="bn-edit-title"
                value={bnEditTitle}
                onChange={(e) => setBnEditTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bn-edit-desc">Description</Label>
              <Textarea
                id="bn-edit-desc"
                value={bnEditDesc}
                onChange={(e) => setBnEditDesc(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBn(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateBn}
              disabled={updateBnMutation.isPending || !bnEditTitle.trim()}
            >
              {updateBnMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingBn}
        onOpenChange={(open) => !open && setDeletingBn(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bottleneck</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingBn?.title}
              &rdquo;? All tasks linked to this bottleneck will also be deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBn}
              disabled={deleteBnMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteBnMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function GoalCard({
  goal,
  bottlenecks,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onBnFormChange,
  onBnSubmit,
  onBnEdit,
  onBnDelete,
  bnFormValue,
  bnCreating,
}: {
  goal: GoalWithCount
  bottlenecks: Bottleneck[]
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onBnFormChange: (goal_id: string, value: string) => void
  onBnSubmit: (goal_id: string, e: React.FormEvent) => void
  onBnEdit: (bn: Bottleneck) => void
  onBnDelete: (bn: Bottleneck) => void
  bnFormValue: string
  bnCreating: boolean
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden transition-colors hover:bg-card">
        <div className="flex items-center gap-2 px-4 py-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              <span className="sr-only">
                {isExpanded ? 'Collapse' : 'Expand'}
              </span>
            </Button>
          </CollapsibleTrigger>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{goal.title}</span>
              {goal._count.bottlenecks > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[11px] px-1.5 py-0 h-5 shrink-0"
                >
                  {goal._count.bottlenecks}{' '}
                  {goal._count.bottlenecks === 1 ? 'bottleneck' : 'bottlenecks'}
                </Badge>
              )}
              {goal._count.tasks > 0 && (
                <Badge
                  variant="outline"
                  className="text-[11px] px-1.5 py-0 h-5 shrink-0"
                >
                  {goal._count.tasks}{' '}
                  {goal._count.tasks === 1 ? 'task' : 'tasks'}
                </Badge>
              )}
            </div>
            {goal.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {goal.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0"
            style={{ opacity: 1 }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
              <span className="sr-only">Edit goal</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
              <span className="sr-only">Delete goal</span>
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border/40 bg-muted/20 px-4 py-3 space-y-2">
            <form
              onSubmit={(e) => onBnSubmit(goal.id, e)}
              className="flex gap-2 pl-5"
            >
              <Input
                placeholder="Add a bottleneck..."
                value={bnFormValue}
                onChange={(e) => onBnFormChange(goal.id, e.target.value)}
                className="flex-1 h-8 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs"
                disabled={!bnFormValue.trim() || bnCreating}
              >
                <Plus className="size-3" />
                Add
              </Button>
            </form>

            {bottlenecks.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-5 py-2">
                No bottlenecks yet. Add one above.
              </p>
            ) : (
              <div className="space-y-1">
                {bottlenecks.map((bn) => (
                  <div
                    key={bn.id}
                    className="group/bn flex items-center gap-2 pl-5 pr-2 py-2 rounded-md hover:bg-muted/60 transition-colors"
                  >
                    <GripVertical className="size-3 text-muted-foreground/40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{bn.title}</span>
                      {bn.description && (
                        <span className="text-xs text-muted-foreground truncate block">
                          {bn.description}
                        </span>
                      )}
                    </div>
                    {bn._count && bn._count.tasks > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                      >
                        {bn._count.tasks}
                      </Badge>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/bn:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => onBnEdit(bn)}
                      >
                        <Pencil className="size-3" />
                        <span className="sr-only">Edit bottleneck</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-destructive hover:text-destructive"
                        onClick={() => onBnDelete(bn)}
                      >
                        <Trash2 className="size-3" />
                        <span className="sr-only">Delete bottleneck</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
