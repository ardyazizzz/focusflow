import { useState, useRef, useEffect, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send, Sparkles, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/use-app-store'
import { supabase } from '@/lib/supabase'
import type { CoachMessage } from '@/store/use-app-store'
import type { Goal, Bottleneck, Task, DimensionOption } from '@/types'

async function fetchCoachContext() {
  const [goalsResult, bottlenecksResult, tasksResult, optionsResult, settingsResult] =
    await Promise.all([
      supabase.from('Goal').select('*, bottlenecks:bottleneck(count), tasks:task(count)').order('createdAt', { ascending: false }),
      supabase.from('Bottleneck').select('*, goal:Goal(id, title), tasks:task(count)').order('createdAt', { ascending: false }),
      supabase.from('Task').select('*, goal:Goal(id, title), bottleneck:Bottleneck(id, title), priorityOption:ExecutionDimensionOption(id, dimension, label, sortOrder), impactOption:ExecutionDimensionOption(id, dimension, label, sortOrder), clarityOption:ExecutionDimensionOption(id, dimension, label, sortOrder), timeOption:ExecutionDimensionOption(id, dimension, label, sortOrder)').order('createdAt', { ascending: false }),
      supabase.from('ExecutionDimensionOption').select('*').order('dimension', { ascending: true }).order('sortOrder', { ascending: true }),
      supabase.from('AppSetting').select('*'),
    ])

  const goals = (goalsResult.data ?? []) as Goal[]
  const bottlenecks = (bottlenecksResult.data ?? []) as Bottleneck[]
  const tasks = (tasksResult.data ?? []) as unknown as Task[]
  const dimensionOptions = (optionsResult.data ?? []) as DimensionOption[]
  const allSettings = settingsResult.data ?? []

  const settingsMap: Record<string, string> = {}
  for (const s of allSettings) settingsMap[s.key] = s.value
  const dimensionNames: Record<string, string> = {}
  for (const [key, value] of Object.entries(settingsMap)) {
    if (key.startsWith('dimensionName_')) {
      dimensionNames[key.replace('dimensionName_', '')] = value
    }
  }

  const groupedDimensions: Record<string, { label: string; sortOrder: number }[]> = {}
  for (const option of dimensionOptions) {
    if (!groupedDimensions[option.dimension]) groupedDimensions[option.dimension] = []
    groupedDimensions[option.dimension].push({ label: option.label, sortOrder: option.sortOrder })
  }

  const pendingTasks = tasks.filter((t: Task) => t.status === 'pending')
  const completedTasks = tasks.filter((t: Task) => t.status === 'completed')

  return {
    dimensionNames,
    goals,
    bottlenecks,
    pendingTasks,
    completedTasks,
    groupedDimensions,
  }
}

function buildSystemPrompt(ctx: Awaited<ReturnType<typeof fetchCoachContext>>) {
  const contextSummary = `
### Goals (${ctx.goals.length} total)
${ctx.goals.map((g) => `- **${g.title}**${g.description ? `: ${g.description}` : ''}`).join('\n') || '(No goals yet)'}

### Bottlenecks (${ctx.bottlenecks.length} total)
${ctx.bottlenecks.map((b) => `- **${b.title}**${b.description ? `: ${b.description}` : ''} (Goal: ${b.goal?.title})`).join('\n') || '(No bottlenecks yet)'}

### Pending Tasks (${ctx.pendingTasks.length})
${ctx.pendingTasks.map((t) => `- **${t.title}** | Goal: ${t.goal.title} | Priority: ${t.priorityOption.label}${t.impactOption ? ` | Impact: ${t.impactOption.label}` : ''}${t.deadline ? ` | Deadline: ${new Date(t.deadline).toLocaleDateString()}` : ''}`).join('\n') || '(No pending tasks)'}

### Completed Tasks (${ctx.completedTasks.length})
${ctx.completedTasks.length > 0 ? ctx.completedTasks.slice(-10).map((t) => `- **${t.title}** (Goal: ${t.goal.title})`).join('\n') : '(No completed tasks yet)'}

### Execution Dimensions
${Object.entries(ctx.groupedDimensions).map(([dim, opts]) => `- **${ctx.dimensionNames[dim] || dim}**: ${opts.map((o) => o.label).join(', ')}`).join('\n') || '(No dimensions configured)'}
`.trim()

  return `You are FocusFlow AI Coach, a dedicated productivity coach who deeply understands the user's personal productivity system. You have full visibility into the user's goals, bottlenecks, tasks, and execution dimensions.

Your role:
- Help the user prioritize tasks based on their goals and execution dimensions
- Suggest ways to overcome bottlenecks
- Provide actionable, concise productivity advice
- Ask clarifying questions when the user's request is ambiguous
- Be encouraging but realistic
- Keep responses focused and actionable — avoid fluff

Here is the user's complete productivity context:

${contextSummary}

Respond in the same language the user writes in. Be concise and practical. Use markdown for formatting.`
}

export default function CoachScreen() {
  const { coachMessages, addCoachMessage, clearCoachMessages } = useAppStore()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        '[data-slot="scroll-area-viewport"]'
      ) as HTMLElement
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [coachMessages, isLoading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    addCoachMessage('user', trimmed)
    setInput('')
    setIsLoading(true)

    try {
      const ctx = await fetchCoachContext()
      const systemPrompt = buildSystemPrompt(ctx)

      const [deepSeekSetting, geminiSetting] = await Promise.all([
        supabase.from('AppSetting').select('value').eq('key', 'deepseek_api_key').maybeSingle(),
        supabase.from('AppSetting').select('value').eq('key', 'gemini_api_key').maybeSingle(),
      ])

      const deepSeekKey = deepSeekSetting?.data?.value || import.meta.env.VITE_DEEPSEEK_API_KEY
      const geminiKey = geminiSetting?.data?.value || import.meta.env.VITE_GEMINI_API_KEY

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...coachMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content })),
        { role: 'user' as const, content: trimmed },
      ]

      if (deepSeekKey) {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepSeekKey}`,
          },
          body: JSON.stringify({ model: 'deepseek-chat', messages }),
        })
        if (!res.ok) throw new Error('DeepSeek API request failed')
        const data = await res.json()
        const assistantMessage = data?.choices?.[0]?.message?.content || ''
        if (assistantMessage) {
          addCoachMessage('assistant', assistantMessage)
        } else {
          throw new Error('Empty response')
        }
      } else if (geminiKey) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [
              ...coachMessages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
              })),
              { role: 'user', parts: [{ text: trimmed }] },
            ],
          }),
        })
        if (!res.ok) throw new Error('Gemini API request failed')
        const data = await res.json()
        const assistantMessage = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        if (assistantMessage) {
          addCoachMessage('assistant', assistantMessage)
        } else {
          throw new Error('Empty response')
        }
      } else {
        addCoachMessage(
          'assistant',
          'To enable the AI Coach, add a setting with key `deepseek_api_key` (recommended, get a key at [platform.deepseek.com](https://platform.deepseek.com/api_keys)) or `gemini_api_key` (get a free key at [aistudio.google.com](https://aistudio.google.com/apikey)).'
        )
      }
    } catch {
      addCoachMessage(
        'assistant',
        'Sorry, something went wrong. Please try again. Make sure your API key is valid.'
      )
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    clearCoachMessages()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold">AI Coach</h2>
        </div>
        {coachMessages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            <span className="hidden sm:inline">Clear Chat</span>
          </Button>
        )}
      </div>

      <Separator />

      <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4 sm:px-6">
        {coachMessages.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-7 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">FocusFlow Coach</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Hi! I&apos;m your FocusFlow Coach. I understand your goals, tasks,
              and bottlenecks. Ask me anything about your productivity.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pb-2">
            {coachMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full sm:size-8 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <span className="text-xs font-medium">You</span>
                  ) : (
                    <Sparkles className="size-3.5 text-primary sm:size-4" />
                  )}
                </div>

                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[70%] sm:px-4 sm:py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:font-semibold">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted sm:size-8">
                  <Sparkles className="size-3.5 text-primary sm:size-4" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-3">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Thinking...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-4 py-3 sm:px-6"
      >
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your coach..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          <span className="sr-only">Send message</span>
        </Button>
      </form>
    </div>
  )
}
