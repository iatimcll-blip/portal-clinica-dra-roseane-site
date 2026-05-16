-- =====================================================
-- PAINEL CLÍNICA ROSEANE DÉBORA — SCHEMA COMPLETO
-- Execute este arquivo no SQL Editor do Supabase
-- =====================================================

-- 1. PERFIS DE USUÁRIO (estende auth.users do Supabase)
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome            TEXT NOT NULL,
  primeiro_nome   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CONFIGURAÇÕES POR MÊS (metas do mês)
CREATE TABLE IF NOT EXISTS configuracoes_mes (
  id                    SERIAL PRIMARY KEY,
  mes                   INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano                   INTEGER NOT NULL DEFAULT 2025,
  meta_clinica          NUMERIC(12,2) NOT NULL DEFAULT 55000,
  meta_gatilho          NUMERIC(12,2) NOT NULL DEFAULT 15000,
  meta_max              NUMERIC(12,2) NOT NULL DEFAULT 18000,
  meta_individual_anual NUMERIC(12,2) NOT NULL DEFAULT 187000,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mes, ano)
);

-- 3. RESULTADOS POR PROFISSIONAL POR MÊS
CREATE TABLE IF NOT EXISTS resultados (
  id                   SERIAL PRIMARY KEY,
  profile_id           UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mes                  INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano                  INTEGER NOT NULL DEFAULT 2025,
  realizado            NUMERIC(12,2) NOT NULL DEFAULT 0,
  comissao_avaliacoes  NUMERIC(12,2) NOT NULL DEFAULT 0,
  nota_feedback        NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (nota_feedback BETWEEN 0 AND 10),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, mes, ano)
);

ALTER TABLE resultados
  ADD COLUMN IF NOT EXISTS nota_feedback NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (nota_feedback BETWEEN 0 AND 10);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.ativo = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- PROFILES: cada um vê o próprio; admin vê todos
DROP POLICY IF EXISTS "user_see_own_profile" ON profiles;
CREATE POLICY "user_see_own_profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin_see_all_profiles" ON profiles;
CREATE POLICY "admin_see_all_profiles"
  ON profiles FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles"
  ON profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_profiles" ON profiles;
CREATE POLICY "admin_insert_profiles"
  ON profiles FOR INSERT
  WITH CHECK (public.is_admin());

-- CONFIGURACOES_MES: todos autenticados leem; só admin escreve
DROP POLICY IF EXISTS "authenticated_read_config" ON configuracoes_mes;
CREATE POLICY "authenticated_read_config"
  ON configuracoes_mes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_config" ON configuracoes_mes;
CREATE POLICY "admin_write_config"
  ON configuracoes_mes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- RESULTADOS: user vê só os próprios; admin vê e edita todos
DROP POLICY IF EXISTS "user_see_own_resultados" ON resultados;
CREATE POLICY "user_see_own_resultados"
  ON resultados FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "admin_see_all_resultados" ON resultados;
CREATE POLICY "admin_see_all_resultados"
  ON resultados FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_write_resultados" ON resultados;
CREATE POLICY "admin_write_resultados"
  ON resultados FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =====================================================
-- TRIGGER: cria profile automático após signup
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, primeiro_nome, role, ativo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'primeiro_nome', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    primeiro_nome = EXCLUDED.primeiro_nome,
    role = EXCLUDED.role,
    ativo = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- DADOS INICIAIS: configurações dos 12 meses de 2025
-- =====================================================
INSERT INTO configuracoes_mes (mes, ano, meta_clinica, meta_gatilho, meta_max, meta_individual_anual)
VALUES
  (1,  2025, 55000, 15000, 18000, 187000),
  (2,  2025, 55000, 15000, 18000, 187000),
  (3,  2025, 55000, 15000, 18000, 187000),
  (4,  2025, 55000, 15000, 18000, 187000),
  (5,  2025, 55000, 15000, 18000, 187000),
  (6,  2025, 55000, 15000, 18000, 187000),
  (7,  2025, 55000, 15000, 18000, 187000),
  (8,  2025, 55000, 15000, 18000, 187000),
  (9,  2025, 55000, 15000, 18000, 187000),
  (10, 2025, 55000, 15000, 18000, 187000),
  (11, 2025, 55000, 15000, 18000, 187000),
  (12, 2025, 55000, 15000, 18000, 187000)
ON CONFLICT (mes, ano) DO NOTHING;
