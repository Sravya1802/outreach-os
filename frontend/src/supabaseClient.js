import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('[Supabase] URL:', supabaseUrl ? '✓ loaded' : '✗ MISSING')
console.log('[Supabase] ANON_KEY:', supabaseAnonKey ? '✓ loaded' : '✗ MISSING')

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing env vars — using placeholder client. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)
