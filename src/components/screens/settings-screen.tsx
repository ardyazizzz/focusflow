import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Timer,
  Pencil,
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import type { SettingsData, DimensionsData, DimensionOption } from '@/types'

const DIMENSION_KEYS = ['priority', 'impact', 'clarity', 'time'] as const
type DimensionKey = (typeof DIMENSION_KEYS)[number]

const DEFAULT_NAMES: Record<DimensionKey, string> = {
  priority: 'Priority',
  impact: 'Impact',
  clarity: 'Clarity',
  time: 'Time',
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

async function fetchDimensions(): Promise<DimensionsData> {
  const { data: options } = await supabase
    .from('execution_dimension_options')
    .select('*')
    .order('dimension', { ascending: true })
    .order('sort_order', { ascending: true })

  const opts = (options ?? []) as { id: string; dimension: string; label: string; sort_order: number; createdAt: string; updatedAt: string }[]

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

  const grouped: Record<string, DimensionOption[]> = {}
  for (const option of opts) {
    if (!grouped[option.dimension]) grouped[option.dimension] = []
    grouped[option.dimension].push({ id: option.id, dimension: option.dimension, label: option.label, sort_order: option.sort_order })
  }

  return { dimensionNames, options: grouped }
}

async function upsertSetting(key: string, value: string) {
  const { data: existing } = await supabase.from('app_settings').select('id').eq('key', key).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('app_settings').update({ value }).eq('key', key)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('app_settings').insert({ key, value })
    if (error) throw new Error(error.message)
  }
}

export default function SettingsScreen() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading: settingsLoading } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const { data: dimensions, isLoading: dimensionsLoading } = useQuery<DimensionsData>({
    queryKey: ['dimensions'],
    queryFn: fetchDimensions,
  })

  const [nameEdits, setNameEdits] = useState<Partial<Record<DimensionKey, string>>>({})

  const getName = useCallback(
    (key: DimensionKey) =>
      nameEdits[key] ??
      (settings?.[`dimensionName_${key}` as keyof SettingsData] as string) ??
      DEFAULT_NAMES[key],
    [nameEdits, settings]
  )

  const getCurrentNames = useCallback((): Record<DimensionKey, string> => {
    const result: Record<string, string> = {}
    for (const key of DIMENSION_KEYS) {
      result[key] = getName(key)
    }
    return result as Record<DimensionKey, string>
  }, [getName])

  // ── AI Coach state (localStorage — never stored in Supabase) ──────
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('focusflow_ai_provider') || 'deepseek')
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('focusflow_ai_model') || 'deepseek-chat')
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('focusflow_ai_key') || '')

  const aiModels: Record<string, string[]> = {
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    gemini: ['gemini-2.0-flash', 'gemini-2.0-pro'],
  }

  function handleProviderChange(val: string) {
    setAiProvider(val)
    const defaultModel = val === 'deepseek' ? 'deepseek-chat' : 'gemini-2.0-flash'
    setAiModel(defaultModel)
  }

  function saveAiSettings() {
    localStorage.setItem('focusflow_ai_provider', aiProvider)
    localStorage.setItem('focusflow_ai_model', aiModel)
    localStorage.setItem('focusflow_ai_key', aiApiKey)
    toast.success('AI Coach settings saved')
  }

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingOption, setEditingOption] = useState<DimensionOption | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editSortOrder, setEditSortOrder] = useState(0)
  const [editDimension, setEditDimension] = useState<DimensionKey | null>(null)

  const saveNamesMutation = useMutation({
    mutationFn: async (names: Record<string, string>) => {
      for (const key of DIMENSION_KEYS) {
        await upsertSetting(`dimensionName_${key}`, names[key])
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['dimensions'] })
      toast.success('Dimension names saved')
    },
    onError: () => {
      toast.error('Failed to save dimension names')
    },
  })

  const savePomodoroMutation = useMutation({
    mutationFn: async (value: string) => {
      await upsertSetting('pomodoroDuration', value)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Timer duration updated')
    },
    onError: () => {
      toast.error('Failed to update timer duration')
    },
  })

  const createOptionMutation = useMutation({
    mutationFn: async ({ dimension, label, sort_order }: { dimension: string; label: string; sort_order: number }) => {
      const { error } = await supabase.from('execution_dimension_options').insert({ dimension, label, sort_order })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dimensions'] })
      toast.success('Option added')
    },
    onError: () => {
      toast.error('Failed to add option')
    },
  })

  const updateOptionMutation = useMutation({
    mutationFn: async ({ id, label, sort_order }: { id: string; label: string; sort_order: number }) => {
      const { error } = await supabase.from('execution_dimension_options').update({ label, sort_order }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dimensions'] })
      toast.success('Option updated')
      setEditDialogOpen(false)
    },
    onError: () => {
      toast.error('Failed to update option')
    },
  })

  const deleteOptionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('execution_dimension_options').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dimensions'] })
      toast.success('Option deleted')
    },
    onError: () => {
      toast.error('Failed to delete option')
    },
  })

  const handlePomodoroChange = useCallback(
    (value: number[]) => {
      const minutes = value[0]
      savePomodoroMutation.mutate(String(minutes))
    },
    [savePomodoroMutation]
  )

  const handleNameChange = useCallback(
    (key: DimensionKey, value: string) => {
      setNameEdits((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleSaveNames = useCallback(() => {
    const names = getCurrentNames()
    saveNamesMutation.mutate(names, {
      onSuccess: () => {
        setNameEdits({})
      },
    })
  }, [saveNamesMutation, getCurrentNames])

  const openAddDialog = useCallback((dimension: DimensionKey) => {
    setEditingOption(null)
    setEditDimension(dimension)
    setEditLabel('')
    setEditSortOrder((dimensions?.options[dimension]?.length ?? 0) + 1)
    setEditDialogOpen(true)
  }, [dimensions])

  const openEditDialog = useCallback((dimension: DimensionKey, option: DimensionOption) => {
    setEditingOption(option)
    setEditDimension(dimension)
    setEditLabel(option.label)
    setEditSortOrder(option.sort_order)
    setEditDialogOpen(true)
  }, [])

  const handleDialogSave = useCallback(() => {
    if (!editLabel.trim() || !editDimension) return
    if (editingOption) {
      updateOptionMutation.mutate({
        id: editingOption.id,
        label: editLabel.trim(),
        sort_order: editSortOrder,
      })
    } else {
        createOptionMutation.mutate({
          dimension: editDimension,
          label: editLabel.trim(),
          sort_order: editSortOrder,
      })
      setEditDialogOpen(false)
    }
  }, [editLabel, editSortOrder, editDimension, editingOption, updateOptionMutation, createOptionMutation])

  const isLoading = settingsLoading || dimensionsLoading
  const pomodoroValue = settings?.pomodoroDuration ?? 25

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-6 p-4 pb-8 sm:p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Timer className="size-4 text-primary" />
              <CardTitle className="text-base">Pomodoro Timer</CardTitle>
            </div>
            <CardDescription>
              Set the default focus session duration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Duration</span>
              <span className="text-sm font-semibold tabular-nums">
                {pomodoroValue} min
              </span>
            </div>
            <Slider
              value={[pomodoroValue]}
              onValueChange={handlePomodoroChange}
              min={5}
              max={60}
              step={5}
              disabled={savePomodoroMutation.isPending}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 min</span>
              <span>60 min</span>
            </div>
          </CardContent>
        </Card>

        {/* ── AI Coach ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <CardTitle className="text-base">AI Coach</CardTitle>
            </div>
            <CardDescription>
              Connect an AI provider for personalized coaching based on your goals and tasks.
              Get a free key at <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="underline">platform.deepseek.com</a> or <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">aistudio.google.com</a>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Select value={aiProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek (recommended)</SelectItem>
                  <SelectItem value="gemini">Gemini (free tier)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Model</Label>
              <Select value={aiModel} onValueChange={setAiModel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aiModels[aiProvider]?.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-key">API Key</Label>
              <Input
                id="ai-key"
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <Button
              onClick={saveAiSettings}
              disabled={!aiApiKey.trim()}
              size="sm"
            >
              Save
            </Button>
            {aiApiKey && (
              <p className="text-xs text-muted-foreground">
                Using {aiProvider === 'deepseek' ? 'DeepSeek' : 'Gemini'} — key stored in your browser only.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Execution Dimension Names
            </CardTitle>
            <CardDescription>
              Rename the four dimensions used to evaluate tasks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DIMENSION_KEYS.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`dim-name-${key}`} className="text-sm">
                  {DEFAULT_NAMES[key]}
                </Label>
                <Input
                  id={`dim-name-${key}`}
                  value={getName(key)}
                  onChange={(e) => handleNameChange(key, e.target.value)}
                  placeholder={DEFAULT_NAMES[key]}
                />
              </div>
            ))}
            <div className="pt-2">
              <Button
                onClick={handleSaveNames}
                disabled={saveNamesMutation.isPending}
                size="sm"
              >
                {saveNamesMutation.isPending && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                Save All
              </Button>
            </div>
          </CardContent>
        </Card>

        {DIMENSION_KEYS.map((dimKey) => {
          const name = dimensions?.dimensionNames[dimKey] ?? DEFAULT_NAMES[dimKey]
          const options = dimensions?.options[dimKey] ?? []

          return (
            <Card key={dimKey}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{name} Options</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAddDialog(dimKey)}
                    disabled={createOptionMutation.isPending}
                  >
                    <Plus className="size-3.5" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {options.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    No options yet. Add one to get started.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {options
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((option) => (
                        <div
                          key={option.id}
                          className="group flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
                        >
                          <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />
                          <span className="flex-1 text-sm">{option.label}</span>
                          <span className="text-xs text-muted-foreground">
                            #{option.sort_order}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => openEditDialog(dimKey, option)}
                          >
                            <Pencil className="size-3" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                              >
                                <Trash2 className="size-3" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete &quot;{option.label}&quot;?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove this option.
                                  Existing tasks using this option may be
                                  affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    deleteOptionMutation.mutate(option.id)
                                  }
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingOption ? 'Edit Option' : 'Add Option'}
            </DialogTitle>
            <DialogDescription>
              {editingOption
                ? `Updating option for ${editDimension}.`
                : `Adding a new option for ${editDimension}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="opt-label">Label</Label>
              <Input
                id="opt-label"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="e.g. High, Medium, Low"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDialogSave()
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt-sort">Sort Order</Label>
              <Input
                id="opt-sort"
                type="number"
                min={0}
                value={editSortOrder}
                onChange={(e) => setEditSortOrder(Number(e.target.value))}
                placeholder="1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDialogSave}
              disabled={!editLabel.trim() || updateOptionMutation.isPending || createOptionMutation.isPending}
            >
              {(updateOptionMutation.isPending || createOptionMutation.isPending) && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {editingOption ? 'Save Changes' : 'Add Option'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
