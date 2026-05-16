import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey || url.includes('placeholder') || anonKey.includes('placeholder')) {
    throw new Error('Supabase real nao configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }

  return createBrowserClient(url, anonKey)
}
