import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const isConfigured = supabaseUrl !== '' && supabaseAnonKey !== ''

function createMockChain(hasError = false) {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: hasError ? new Error('Supabase not configured') : null }).then(resolve)
      }
      if (prop === 'catch') {
        return (fn: (e: Error) => void) => {
          if (hasError) fn(new Error('Supabase not configured'))
          return Promise.resolve()
        }
      }
      if (prop === 'finally') {
        return (fn: () => void) => Promise.resolve().then(fn)
      }
      return () => createMockChain(hasError)
    },
  }) as any
}

let realClient: ReturnType<typeof createClient> | null = null
try {
  if (isConfigured) {
    realClient = createClient(supabaseUrl, supabaseAnonKey)
  }
} catch {
  realClient = null
}

export const supabase = realClient ?? createMockChain(false)
