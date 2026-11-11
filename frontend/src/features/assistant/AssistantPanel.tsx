import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, Loader2, Plus, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAuth } from '@/auth/useAuth'
import { AssistantError, useAskAssistant, useRealProjects, type AssistantMessage } from '../../api/queries/assistant'

const PROJECT_KEY = 'taramisu.assistant.project'
// The backend accepts at most 20 messages; older ones are dropped from the request, not from the view.
const MAX_HISTORY = 20
const SUGGESTIONS = ['What is this project about?', 'Which item definitions are there?']

type ChatEntry = AssistantMessage & { toolsUsed?: string[] }

function loadProjectId(): string {
  try {
    return localStorage.getItem(PROJECT_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveProjectId(id: string) {
  try {
    localStorage.setItem(PROJECT_KEY, id)
  } catch {
    // Storage unavailable (private window): the choice is just not remembered.
  }
}

function errorText(error: Error): string {
  if (error instanceof AssistantError) {
    if (error.status === 429) return 'The assistant is busy. Try again in a few seconds.'
    if (error.status === 503) return 'The assistant is not available. Is LLM_API_KEY set for the LLM service?'
  }
  return error.message
}

/**
 * Collapsible chat with the AI assistant (prototype, #229). The workspace still shows mock data, so the panel
 * asks about a real project chosen here. The conversation lives only in this component; the server stores nothing.
 */
export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status, signIn } = useAuth()
  const { pathname } = useLocation()
  const signedIn = status === 'authenticated'
  const projects = useRealProjects(open && signedIn)
  const ask = useAskAssistant()
  const [projectId, setProjectIdState] = useState(loadProjectId)
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // A remembered project that no longer exists (or none yet) falls back to the first project.
  const projectList = projects.data ?? []
  const activeProjectId = projectList.some((p) => p.id === projectId) ? projectId : (projectList[0]?.id ?? '')

  // Keep the newest message in view; scrolling is cheap, so it simply runs after every render.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' })
  })

  function selectProject(id: string) {
    setProjectIdState(id)
    saveProjectId(id)
    setMessages([])
    ask.reset()
  }

  function submit(text: string) {
    const content = text.trim()
    if (!content || !activeProjectId || ask.isPending) return
    const history = [...messages, { role: 'user' as const, content }]
    setMessages(history)
    setDraft('')
    ask.mutate(
      { projectId: activeProjectId, messages: history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })) },
      {
        onSuccess: (answer) =>
          setMessages((current) => [...current, { role: 'assistant', content: answer.answer, toolsUsed: answer.tools_used ?? [] }]),
      },
    )
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(draft)
    }
  }

  if (!open) return null
  const ready = Boolean(activeProjectId)

  return (
    <aside aria-label="Assistant" className="flex w-96 shrink-0 flex-col border-l bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="size-5 text-primary" aria-hidden />
        <span className="font-medium">Assistant</span>
        <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">Prototype</span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="New conversation" onClick={() => { setMessages([]); ask.reset() }}>
          <Plus />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Close assistant" onClick={onClose}>
          <X />
        </Button>
      </div>

      {!signedIn && (
        <div className="space-y-2 border-b px-3 py-3 text-sm">
          <p className="text-muted-foreground">Sign in to ask the assistant about your projects.</p>
          <Button size="sm" variant="outline" onClick={() => void signIn(pathname)}>Sign in</Button>
        </div>
      )}
      <div className="border-b px-3 py-2">
        <label htmlFor="assistant-project" className="mb-1 block text-xs text-muted-foreground">
          Project (from the database)
        </label>
        <NativeSelect id="assistant-project" size="sm" className="w-full" value={activeProjectId}
          onChange={(e) => selectProject(e.target.value)} disabled={!projectList.length}>
          {projectList.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
        </NativeSelect>
        {projects.isError && <p className="mt-1 text-xs text-destructive">The projects could not be loaded.</p>}
        {projects.isSuccess && !projectList.length && (
          <p className="mt-1 text-xs text-muted-foreground">You have no projects in the database yet.</p>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">
        {ready && messages.length === 0 && (
          <div className="space-y-2 text-muted-foreground">
            <p>Ask me about this project. I can only read; I do not change anything.</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <Button key={s} size="xs" variant="outline" onClick={() => submit(s)}>{s}</Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => <Bubble key={i} entry={m} />)}
        {ask.isPending && (
          <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…</p>
        )}
        {ask.isError && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-destructive">{errorText(ask.error)}</p>}
        <div ref={bottomRef} />
      </div>

      <form className="flex items-end gap-2 border-t p-3" onSubmit={(e: FormEvent) => { e.preventDefault(); submit(draft) }}>
        <Textarea rows={2} className="min-h-0 flex-1 resize-none" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown} maxLength={4000} disabled={!ready} aria-label="Message to the assistant"
          placeholder={ready ? 'Message… (Enter sends, Shift+Enter new line)' : 'Choose a project first'} />
        <Button type="submit" size="icon" aria-label="Send" disabled={!ready || !draft.trim() || ask.isPending}>
          <Send />
        </Button>
      </form>
    </aside>
  )
}

function Bubble({ entry }: { entry: ChatEntry }) {
  const user = entry.role === 'user'
  return (
    <div className={cn('flex flex-col', user ? 'items-end' : 'items-start')}>
      <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap',
        user ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
        {entry.content}
      </div>
      {!!entry.toolsUsed?.length && (
        <p className="mt-0.5 text-xs text-muted-foreground">Read: {entry.toolsUsed.join(', ')}</p>
      )}
    </div>
  )
}
