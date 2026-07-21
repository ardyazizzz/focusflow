import { useState, useRef, useEffect, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { preprocessMarkdown } from '@/lib/markdown'
import { Send, Sparkles, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/use-app-store'
import { supabase } from '@/lib/supabase'
import { normalizeCustomValues } from '@/lib/icons'
import type { CoachMessage } from '@/store/use-app-store'
import type { Goal, Bottleneck, Task, CustomLabel, CustomLabelOption } from '@/types'

async function fetchCoachContext() {
  const [goalsResult, bottlenecksResult, tasksResult, labelsResult] =
    await Promise.all([
      supabase.from('goals').select('*, bottlenecks:bottlenecks(count), tasks:tasks(count)').order('created_at', { ascending: false }),
      supabase.from('bottlenecks').select('*, goal:goals(id, title), tasks:tasks(count)').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*, goal:goals(id, title), bottleneck:bottlenecks(id, title), custom_values').order('created_at', { ascending: false }),
      supabase.from('custom_labels').select('*').order('sort_order', { ascending: true }),
    ])

  const goals = (goalsResult.data ?? []) as Goal[]
  const bottlenecks = (bottlenecksResult.data ?? []) as Bottleneck[]
  const tasks = (tasksResult.data ?? []) as unknown as Task[]
  const labels = (labelsResult.data ?? []) as CustomLabel[]

  const pendingTasks = tasks.filter((t: Task) => t.status === 'pending')
  const completedTasks = tasks.filter((t: Task) => t.status === 'completed')

  function formatCustomValues(task: Task): string {
    const cv = normalizeCustomValues(task.custom_values)
    const parts: string[] = []
    for (const [labelName, values] of Object.entries(cv)) {
      if (values.length > 0) {
        parts.push(`${labelName}: ${values.join(', ')}`)
      }
    }
    if (task.deadline) {
      parts.push(`Deadline: ${new Date(task.deadline).toLocaleDateString()}`)
    }
    return parts.length > 0 ? ` [${parts.join(' | ')}]` : ''
  }

  return { labels, goals, bottlenecks, pendingTasks, completedTasks, formatCustomValues }
}

function buildSystemPrompt(ctx: Awaited<ReturnType<typeof fetchCoachContext>>) {
  const contextSummary = `
### Goals (${ctx.goals.length} total)
${ctx.goals.map((g) => `- **${g.title}**${g.description ? `: ${g.description}` : ''}`).join('\n') || '(No goals yet)'}

### Bottlenecks (${ctx.bottlenecks.length} total)
${ctx.bottlenecks.map((b) => `- **${b.title}**${b.description ? `: ${b.description}` : ''} (Goal: ${b.goal?.title})`).join('\n') || '(No bottlenecks yet)'}

### Custom Labels
${ctx.labels.length > 0 ? ctx.labels.map((l) => `- **${l.name}**: ${(l.options ?? []).map((o) => o.value).join(', ')}`).join('\n') : '(No custom labels)'}

### Pending Tasks (${ctx.pendingTasks.length})
${ctx.pendingTasks.map((t) => `- **${t.title}** | Goal: ${t.goal?.title ?? '—'}${ctx.formatCustomValues(t)}`).join('\n') || '(No pending tasks)'}

### Completed Tasks (${ctx.completedTasks.length})
${ctx.completedTasks.length > 0 ? ctx.completedTasks.slice(-10).map((t) => `- **${t.title}** (Goal: ${t.goal?.title ?? '—'})`).join('\n') : '(No completed tasks yet)'}
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

      const aiKey = localStorage.getItem('focusflow_ai_key') || ''
      const aiProvider = localStorage.getItem('focusflow_ai_provider') || 'deepseek'
      const aiModel = localStorage.getItem('focusflow_ai_model') || 'deepseek-v4-flash'

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...coachMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content })),
        { role: 'user' as const, content: trimmed },
      ]

      if (aiProvider === 'deepseek' && aiKey) {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiKey}`,
          },
          body: JSON.stringify({ model: aiModel, messages }),
        })
        if (!res.ok) throw new Error('DeepSeek API request failed')
        const data = await res.json()
        const assistantMessage = data?.choices?.[0]?.message?.content || ''
        if (assistantMessage) {
          addCoachMessage('assistant', assistantMessage)
        } else {
          throw new Error('Empty response')
        }
      } else if (aiProvider === 'gemini' && aiKey) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${aiKey}`, {
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
          'To enable the AI Coach, go to **Settings → AI Coach**, pick DeepSeek or Gemini, paste your API key, and save. Get a free key at [platform.deepseek.com](https://platform.deepseek.com/api_keys) (recommended) or [aistudio.google.com](https://aistudio.google.com/apikey).'
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
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[70%] sm:px-4 sm:py-3 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:my-0.5 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:my-0.5 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:font-semibold">
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{preprocessMarkdown(msg.content)}</ReactMarkdown>
                    </div>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkBreaks]}>{preprocessMarkdown(msg.content)}</ReactMarkdown>
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
