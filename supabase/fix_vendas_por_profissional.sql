-- =====================================================
-- VENDAS POR PROFISSIONAL (detalhe individual, privado)
-- Execute no SQL Editor do Supabase
-- =====================================================

CREATE TABLE IF NOT EXISTS vendas (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL,
  data_venda DATE NOT NULL,
  cliente_nome TEXT,
  servico TEXT,
  categoria TEXT,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_comissao NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_see_own_vendas" ON vendas;
CREATE POLICY "user_see_own_vendas"
  ON vendas FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "admin_see_all_vendas" ON vendas;
CREATE POLICY "admin_see_all_vendas"
  ON vendas FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_write_vendas" ON vendas;
CREATE POLICY "admin_write_vendas"
  ON vendas FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_vendas_profile_mes_ano ON vendas (profile_id, mes, ano);
