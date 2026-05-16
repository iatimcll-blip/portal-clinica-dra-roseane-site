'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DEMO_MODE } from '@/lib/demo-data'

type Props = {
  titulo?: string
}

export default function AlterarSenhaCard({ titulo = 'Alterar senha' }: Props) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function handleAlterarSenha(e: React.SyntheticEvent) {
    e.preventDefault()
    setMensagem('')
    setErro('')

    if (novaSenha.length < 6) {
      setErro('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setErro('A confirmação precisa ser igual à nova senha.')
      return
    }

    setSalvando(true)

    if (DEMO_MODE) {
      setErro('A troca de senha real esta desativada porque o site esta em modo demonstracao. Configure o Supabase real e NEXT_PUBLIC_DEMO_MODE=false.')
      setSalvando(false)
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const email = user?.email

    if (!email) {
      setErro('Sessão expirada. Entre novamente para alterar a senha.')
      setSalvando(false)
      return
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password: senhaAtual,
    })

    if (loginError) {
      setErro('Senha atual incorreta.')
      setSalvando(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha })

    if (updateError) {
      setErro('Não foi possível alterar a senha agora.')
      setSalvando(false)
      return
    }

    setSenhaAtual('')
    setNovaSenha('')
    setConfirmarSenha('')
    setMensagem('Senha alterada com sucesso.')
    setSalvando(false)
  }

  return (
    <div className="glass-sm" style={{ padding: 24, marginTop: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{titulo}</h3>
      {DEMO_MODE && (
        <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#facc15', marginBottom: 14 }}>
          Troca de senha real indisponivel enquanto o site estiver em modo demonstracao.
        </div>
      )}
      <form onSubmit={handleAlterarSenha}>
        <div className="responsive-grid password-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
              Senha atual
            </label>
            <input
              type="password"
              className="input-field"
              value={senhaAtual}
              onChange={e => setSenhaAtual(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
              Nova senha
            </label>
            <input
              type="password"
              className="input-field"
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
              Confirmar nova senha
            </label>
            <input
              type="password"
              className="input-field"
              value={confirmarSenha}
              onChange={e => setConfirmarSenha(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
        </div>

        {erro && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 14 }}>
            {erro}
          </div>
        )}

        {mensagem && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#4ade80', marginBottom: 14 }}>
            {mensagem}
          </div>
        )}

        <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 22px' }} disabled={salvando}>
          {salvando ? 'Alterando...' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  )
}
