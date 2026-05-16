'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import DecoracaoDireita from '@/components/DecoracaoDireita'
import { assetPath } from '@/lib/asset-path'

export default function RedefinirSenhaPage() {
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [validando, setValidando] = useState(true)
  const [sessaoValida, setSessaoValida] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    async function prepararSessaoDeRecuperacao() {
      const supabase = createClient()
      const url = new URL(window.location.href)
      const erroLink = url.searchParams.get('error_description') || url.hash.match(/error_description=([^&]+)/)?.[1]

      if (erroLink) {
        setErro(decodeURIComponent(erroLink.replace(/\+/g, ' ')))
        setValidando(false)
        return
      }

      const code = url.searchParams.get('code')
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setErro('Link de recuperação inválido ou expirado. Solicite um novo link.')
          setValidando(false)
          return
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          setErro('Link de recuperação inválido ou expirado. Solicite um novo link.')
          setValidando(false)
          return
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      setSessaoValida(Boolean(session))
      if (!session) {
        setErro('Abra esta tela pelo link enviado ao seu e-mail para redefinir a senha.')
      }

      window.history.replaceState(null, '', window.location.pathname)
      setValidando(false)
    }

    prepararSessaoDeRecuperacao()
  }, [])

  async function handleSalvarSenha(e: React.SyntheticEvent) {
    e.preventDefault()
    setErro('')
    setMensagem('')

    if (novaSenha.length < 6) {
      setErro('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setErro('A confirmação precisa ser igual à nova senha.')
      return
    }

    setSalvando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: novaSenha })

    if (error) {
      setErro('Não foi possível salvar a nova senha. Solicite um novo link e tente novamente.')
      setSalvando(false)
      return
    }

    await supabase.auth.signOut()
    setMensagem('Senha alterada com sucesso. Entre novamente usando a nova senha.')
    setNovaSenha('')
    setConfirmarSenha('')
    setSessaoValida(false)
    setSalvando(false)
  }

  return (
    <div className="login-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      <div className="login-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
        <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(190,24,93,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'fixed', bottom: '-20%', left: '20%', width: 600, height: 600, background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', maxWidth: 420 }}>
          <div className="login-brand" style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Image src={assetPath('/logo.png')} alt="Roseane Débora Centro Estético" width={180} height={180}
                style={{ objectFit: 'contain', filter: 'invert(1)', mixBlendMode: 'screen' }} priority />
            </div>
            <p style={{ color: 'rgba(240,230,255,0.5)', fontSize: 14 }}>Painel de Acompanhamento de Metas</p>
          </div>

          <div className="glass login-card" style={{ padding: 36 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10, color: '#f0e6ff' }}>Redefinir senha</h2>
            <p style={{ color: 'rgba(240,230,255,0.5)', fontSize: 13, marginBottom: 24 }}>
              Cadastre uma nova senha para acessar seu painel.
            </p>

            {validando ? (
              <div style={{ color: 'rgba(240,230,255,0.55)', fontSize: 14 }}>Validando link de recuperação...</div>
            ) : (
              <form onSubmit={handleSalvarSenha}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'rgba(240,230,255,0.6)', marginBottom: 8, fontWeight: 500 }}>Nova senha</label>
                  <input type="password" className="input-field" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} disabled={!sessaoValida || salvando} required />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'rgba(240,230,255,0.6)', marginBottom: 8, fontWeight: 500 }}>Confirmar nova senha</label>
                  <input type="password" className="input-field" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} disabled={!sessaoValida || salvando} required />
                </div>

                {erro && (
                  <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>
                    {erro}
                  </div>
                )}
                {mensagem && (
                  <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#86efac', marginBottom: 16 }}>
                    {mensagem}
                  </div>
                )}

                <button type="submit" className="btn-primary" disabled={!sessaoValida || salvando}>
                  {salvando ? 'Salvando...' : 'Salvar nova senha'}
                </button>
                <Link href="/login" style={{ display: 'block', textAlign: 'center', marginTop: 18, color: '#f472b6', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  Voltar para o login
                </Link>
              </form>
            )}
          </div>
        </div>
      </div>
      <DecoracaoDireita />
    </div>
  )
}
