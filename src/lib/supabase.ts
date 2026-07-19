import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const isConfigured = supabaseUrl !== '' && supabaseAnonKey !== ''

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : ({
      from: () => ({
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: null, error: null }), order: () => Promise.resolve({ data: null, error: null }) }),
          order: () => Promise.resolve({ data: null, error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
          then: (resolve: (v: { data: null, error: null }) => void) => Promise.resolve({ data: null, error: null }).then(resolve),
        }),
        insert: () => ({
          select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }),
          }),
        }),
        delete: () => ({
          eq: () => ({ then: (resolve: (v: { data: null, error: null }) => void) => Promise.resolve({ data: null, error: null }).then(resolve) }),
        }),
        then: (resolve: (v: { data: null, error: null }) => void) => Promise.resolve({ data: null, error: null }).then(resolve),
      }),
    } as unknown as ReturnType<typeof createClient>)
