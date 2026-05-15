'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import DecoracaoDireita from '@/components/DecoracaoDireita'
import { DEMO_MODE, matchDemoProfileByEmail } from '@/lib/demo-data'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.SyntheticEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    if (DEMO_MODE) {
      if (email.toLowerCase().includes('admin')) {
        router.push('/admin')
      } else {
        const prof = matchDemoProfileByEmail(email)
        localStorage.setItem('demo_user_id', prof.id)
        router.push('/painel')
      }
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user!.id)
      .single()

    router.push(profile?.role === 'admin' ? '/admin' : '/painel')
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>

        <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(190,24,93,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'fixed', bottom: '-20%', left: '20%', width: 600, height: 600, background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Image src="/logo.png" alt="Roseane Débora Centro Estético" width={180} height={180}
                style={{ objectFit: 'contain', filter: 'invert(1)', mixBlendMode: 'screen' }} priority />
            </div>
            <p style={{ color: 'rgba(240,230,255,0.5)', fontSize: 14 }}>Painel de Acompanhamento de Metas</p>
          </div>

          <div className="glass" style={{ padding: 36 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 24, color: '#f0e6ff' }}>Entrar na sua conta</h2>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'rgba(240,230,255,0.6)', marginBottom: 8, fontWeight: 500 }}>E-mail</label>
                <input type="text" inputMode="email" className="input-field" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'rgba(240,230,255,0.6)', marginBottom: 8, fontWeight: 500 }}>Senha</label>
                <input type="password" className="input-field" placeholder="••••••••" value={senha} onChange={e => setSenha(e.target.value)} required />
              </div>
              {erro && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>
                  ⚠️ {erro}
                </div>
              )}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(240,230,255,0.25)' }}>
            © 2025 Clínica Dra. Roseane Débora · Todos os direitos reservados
          </p>
        </div>
      </div>
      <DecoracaoDireita />
    </div>
  )
}
