import { useState, useCallback } from 'react'
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
import { CUSTOM_LABEL_ICONS, ICON_PICKER_OPTIONS, fetchCustomLabels } from '@/lib/icons'
import type { SettingsData, CustomLabel, CustomLabelOption } from '@/types'

async function fetchSettings(): Promise<SettingsData> {
  const { data: settings } = await supabase.from('app_settings').select('*')
  const map: Record<string, string> = {}
  if (settings) {
    for (const s of settings) map[s.key] = s.value
  }
  return {
    pomodoroDuration: Number(map.pomodoroDuration) || 25,
  }
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

  const { data: labels = [], isLoading: labelsLoading } = useQuery<CustomLabel[]>({
    queryKey: ['custom_labels'],
    queryFn: fetchCustomLabels,
  })

  // ── AI Coach state (localStorage — never stored in Supabase) ──────
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('focusflow_ai_provider') || 'deepseek')
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('focusflow_ai_model') || 'deepseek-chat')
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('focusflow_ai_key') || '')

  const aiModels: Record<string, string[]> = {
    deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    gemini: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  }

  function handleProviderChange(val: string) {
    setAiProvider(val)
    const defaultModel = val === 'deepseek' ? 'deepseek-v4-flash' : 'gemini-3.5-flash'
    setAiModel(defaultModel)
  }

  function saveAiSettings() {
    localStorage.setItem('focusflow_ai_provider', aiProvider)
    localStorage.setItem('focusflow_ai_model', aiModel)
    localStorage.setItem('focusflow_ai_key', aiApiKey)
    toast.success('AI Coach settings saved')
  }

  // ── Custom Labels CRUD ────────────────────────────────────────────

  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelIcon, setNewLabelIcon] = useState('flag')

  const [editingLabel, setEditingLabel] = useState<CustomLabel | null>(null)
  const [editLabelName, setEditLabelName] = useState('')
  const [editLabelIcon, setEditLabelIcon] = useState('')

  const [optionDialogOpen, setOptionDialogOpen] = useState(false)
  const [optionLabelId, setOptionLabelId] = useState<string | null>(null)
  const [editingOption, setEditingOption] = useState<CustomLabelOption | null>(null)
  const [optionValue, setOptionValue] = useState('')
  const [optionSortOrder, setOptionSortOrder] = useState(0)

  const createLabelMutation = useMutation({
    mutationFn: async ({ name, icon }: { name: string; icon: string }) => {
      const { error } = await supabase.from('custom_labels').insert({ name, icon, sort_order: Date.now() })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_labels'] })
      toast.success('Label created')
      setNewLabelName('')
    },
    onError: () => toast.error('Failed to create label'),
  })

  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, name, icon }: { id: string; name: string; icon: string }) => {
      const { error } = await supabase.from('custom_labels').update({ name, icon }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_labels'] })
      toast.success('Label updated')
      setEditingLabel(null)
    },
    onError: () => toast.error('Failed to update label'),
  })

  const deleteLabelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_labels').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_labels'] })
      toast.success('Label deleted')
    },
    onError: () => toast.error('Failed to delete label'),
  })

  const createOptionMutation = useMutation({
    mutationFn: async ({ label_id, value, sort_order }: { label_id: string; value: string; sort_order: number }) => {
      const { error } = await supabase.from('custom_label_options').insert({ label_id, value, sort_order })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_labels'] })
      toast.success('Option added')
      setOptionDialogOpen(false)
    },
    onError: () => toast.error('Failed to add option'),
  })

  const updateOptionMutation = useMutation({
    mutationFn: async ({ id, value, sort_order }: { id: string; value: string; sort_order: number }) => {
      const { error } = await supabase.from('custom_label_options').update({ value, sort_order }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_labels'] })
      toast.success('Option updated')
      setOptionDialogOpen(false)
    },
    onError: () => toast.error('Failed to update option'),
  })

  const deleteOptionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_label_options').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_labels'] })
      toast.success('Option deleted')
    },
    onError: () => toast.error('Failed to delete option'),
  })

  const savePomodoroMutation = useMutation({
    mutationFn: async (value: string) => {
      await upsertSetting('pomodoroDuration', value)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Timer duration updated')
    },
    onError: () => toast.error('Failed to update timer duration'),
  })

  const handlePomodoroChange = useCallback(
    (value: number[]) => {
      const minutes = value[0]
      savePomodoroMutation.mutate(String(minutes))
    },
    [savePomodoroMutation]
  )

  const pomodoroValue = settings?.pomodoroDuration ?? 25
  const isLoading = settingsLoading || labelsLoading

  return (
    <>
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

        {/* ── Custom Labels ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Custom Labels</CardTitle>
                <CardDescription>
                  Define labels for your tasks. Each label can have multiple options. Pick one or more per task.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {labels.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                No labels yet. Add one below.
              </p>
            ) : (
              <div className="space-y-3">
                {labels.map((label) => {
                  const IconComp = CUSTOM_LABEL_ICONS[label.icon] || CUSTOM_LABEL_ICONS.flag
                  return (
                    <div key={label.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <IconComp className="size-4 text-primary/70 shrink-0" />
                          {editingLabel?.id === label.id ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={editLabelName}
                                onChange={(e) => setEditLabelName(e.target.value)}
                                className="h-8 w-40 text-sm"
                                autoFocus
                              />
                              <div className="flex gap-1">
                                {ICON_PICKER_OPTIONS.slice(0, 8).map((ico) => {
                                  const I = CUSTOM_LABEL_ICONS[ico]
                                  return (
                                    <button
                                      key={ico}
                                      type="button"
                                      onClick={() => setEditLabelIcon(ico)}
                                      className={`rounded p-1 transition-colors ${editLabelIcon === ico ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'hover:bg-muted text-muted-foreground'}`}
                                    >
                                      <I className="size-3.5" />
                                    </button>
                                  )
                                })}
                              </div>
                              <Button size="sm" variant="default" className="h-8"
                                onClick={() => updateLabelMutation.mutate({ id: label.id, name: editLabelName, icon: editLabelIcon })}
                                disabled={updateLabelMutation.isPending || !editLabelName.trim()}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8"
                                onClick={() => setEditingLabel(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm font-medium">{label.name}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 opacity-0 group-hover:opacity-100"
                                onClick={() => { setEditingLabel(label); setEditLabelName(label.name); setEditLabelIcon(label.icon) }}
                              >
                                <Pencil className="size-3" />
                              </Button>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setOptionLabelId(label.id)
                              setEditingOption(null)
                              setOptionValue('')
                              setOptionSortOrder((label.options?.length ?? 0) + 1)
                              setOptionDialogOpen(true)
                            }}
                          >
                            <Plus className="size-3" />
                            Option
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7 hover:text-destructive">
                                <Trash2 className="size-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete &quot;{label.name}&quot;?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove this label and all its options.
                                  Existing tasks with this label will keep their data but it won&apos;t be visible anymore.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteLabelMutation.mutate(label.id)}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      {label.options && label.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {label.options.sort((a, b) => a.sort_order - b.sort_order).map((opt) => (
                            <div key={opt.id} className="group flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs">
                              <span>{opt.value}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-4 opacity-0 group-hover:opacity-100"
                                onClick={() => {
                                  setOptionLabelId(label.id)
                                  setEditingOption(opt)
                                  setOptionValue(opt.value)
                                  setOptionSortOrder(opt.sort_order)
                                  setOptionDialogOpen(true)
                                }}
                              >
                                <Pencil className="size-2.5" />
                              </Button>
                              <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteOptionMutation.mutate(opt.id)}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="border-t border-border/40 pt-4">
              <Label className="text-sm font-medium">Add New Label</Label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Label name (e.g. Energy Level)"
                  className="flex-1 h-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newLabelName.trim() && newLabelIcon) {
                      createLabelMutation.mutate({ name: newLabelName.trim(), icon: newLabelIcon })
                    }
                  }}
                />
                <div className="flex gap-0.5">
                  {ICON_PICKER_OPTIONS.slice(0, 12).map((ico) => {
                    const I = CUSTOM_LABEL_ICONS[ico]
                    return (
                      <button
                        key={ico}
                        type="button"
                        onClick={() => setNewLabelIcon(ico)}
                        className={`rounded p-1.5 transition-colors ${newLabelIcon === ico ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'hover:bg-muted text-muted-foreground'}`}
                        title={ico}
                      >
                        <I className="size-3.5" />
                      </button>
                    )
                  })}
                </div>
                <Button
                  size="sm"
                  onClick={() => createLabelMutation.mutate({ name: newLabelName.trim(), icon: newLabelIcon })}
                  disabled={!newLabelName.trim() || createLabelMutation.isPending}
                  className="h-9 shrink-0"
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
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

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingOption ? 'Edit Option' : 'Add Option'}
            </DialogTitle>
            <DialogDescription>
              {editingOption
                ? 'Update the option value and sort order.'
                : 'Add a new option value for this label.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="opt-value">Value</Label>
              <Input
                id="opt-value"
                value={optionValue}
                onChange={(e) => setOptionValue(e.target.value)}
                placeholder="e.g. High, Medium, Low"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (!optionValue.trim()) return
                    if (editingOption) {
                      updateOptionMutation.mutate({ id: editingOption.id, value: optionValue.trim(), sort_order: optionSortOrder })
                    } else if (optionLabelId) {
                      createOptionMutation.mutate({ label_id: optionLabelId, value: optionValue.trim(), sort_order: optionSortOrder })
                    }
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt-sort">Sort Order</Label>
              <Input
                id="opt-sort"
                type="number"
                min={0}
                value={optionSortOrder}
                onChange={(e) => setOptionSortOrder(Number(e.target.value))}
                placeholder="1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!optionValue.trim()) return
                if (editingOption) {
                  updateOptionMutation.mutate({ id: editingOption.id, value: optionValue.trim(), sort_order: optionSortOrder })
                } else if (optionLabelId) {
                  createOptionMutation.mutate({ label_id: optionLabelId, value: optionValue.trim(), sort_order: optionSortOrder })
                }
              }}
              disabled={!optionValue.trim() || updateOptionMutation.isPending || createOptionMutation.isPending}
            >
              {(updateOptionMutation.isPending || createOptionMutation.isPending) && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {editingOption ? 'Save Changes' : 'Add Option'}
            </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
