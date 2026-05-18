-- =====================================================
-- PAINEL CLÍNICA ROSEANE DÉBORA — SCHEMA COMPLETO
-- Execute este arquivo no SQL Editor do Supabase
-- =====================================================

-- 1. PERFIS DE USUÁRIO (estende auth.users do Supabase)
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome            TEXT NOT NULL,
  primeiro_nome   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'gestao', 'user')),
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

-- 4. MATERIAIS INFORMATIVOS PARA PROFISSIONAIS
CREATE TABLE IF NOT EXISTS materiais_informativos (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_type TEXT,
  file_size BIGINT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiais_informativos ENABLE ROW LEVEL SECURITY;

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

CREATE OR REPLACE FUNCTION public.is_admin_or_gestao()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'gestao')
      AND p.ativo = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_admin_or_gestao() TO authenticated;

-- PROFILES: cada um vê o próprio; admin vê todos
DROP POLICY IF EXISTS "user_see_own_profile" ON profiles;
CREATE POLICY "user_see_own_profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin_see_all_profiles" ON profiles;
CREATE POLICY "admin_see_all_profiles"
  ON profiles FOR SELECT
  USING (public.is_admin_or_gestao());

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
  USING (public.is_admin_or_gestao());

DROP POLICY IF EXISTS "admin_write_resultados" ON resultados;
CREATE POLICY "admin_write_resultados"
  ON resultados FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "authenticated_read_active_materials" ON materiais_informativos;
CREATE POLICY "authenticated_read_active_materials"
  ON materiais_informativos FOR SELECT TO authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "admin_read_all_materials" ON materiais_informativos;
CREATE POLICY "admin_read_all_materials"
  ON materiais_informativos FOR SELECT TO authenticated
  USING (public.is_admin_or_gestao());

DROP POLICY IF EXISTS "admin_insert_materials" ON materiais_informativos;
CREATE POLICY "admin_insert_materials"
  ON materiais_informativos FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_materials" ON materiais_informativos;
CREATE POLICY "admin_update_materials"
  ON materiais_informativos FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_materials" ON materiais_informativos;
CREATE POLICY "admin_delete_materials"
  ON materiais_informativos FOR DELETE TO authenticated
  USING (public.is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('materiais-informativos', 'materiais-informativos', false, 52428800)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800;

DROP POLICY IF EXISTS "authenticated_read_material_files" ON storage.objects;
CREATE POLICY "authenticated_read_material_files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'materiais-informativos');

DROP POLICY IF EXISTS "admin_insert_material_files" ON storage.objects;
CREATE POLICY "admin_insert_material_files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materiais-informativos' AND public.is_admin());

DROP POLICY IF EXISTS "admin_update_material_files" ON storage.objects;
CREATE POLICY "admin_update_material_files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'materiais-informativos' AND public.is_admin())
  WITH CHECK (bucket_id = 'materiais-informativos' AND public.is_admin());

DROP POLICY IF EXISTS "admin_delete_material_files" ON storage.objects;
CREATE POLICY "admin_delete_material_files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materiais-informativos' AND public.is_admin());

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
-- RPC: visao individual com posicoes sem expor dados de outras profissionais
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_professional_dashboard(p_mes INTEGER, p_ano INTEGER DEFAULT 2025)
RETURNS TABLE (
  profile_id UUID,
  nome TEXT,
  primeiro_nome TEXT,
  realizado NUMERIC,
  comissao_avaliacoes NUMERIC,
  nota_feedback NUMERIC,
  acumulado_anual NUMERIC,
  media_feedback NUMERIC,
  posicao_mensal INTEGER,
  posicao_anual INTEGER,
  total_clinica NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH profissionais AS (
    SELECT p.id, p.nome, p.primeiro_nome
    FROM public.profiles p
    WHERE p.ativo = true
      AND p.role = 'user'
  ),
  mensal AS (
    SELECT
      p.id AS profile_id,
      p.nome,
      p.primeiro_nome,
      COALESCE(r.realizado, 0) AS realizado,
      COALESCE(r.comissao_avaliacoes, 0) AS comissao_avaliacoes,
      COALESCE(r.nota_feedback, 0) AS nota_feedback
    FROM profissionais p
    LEFT JOIN public.resultados r
      ON r.profile_id = p.id
     AND r.mes = p_mes
     AND r.ano = p_ano
  ),
  mensal_rank AS (
    SELECT
      m.*,
      ROW_NUMBER() OVER (ORDER BY m.realizado DESC, m.nome ASC)::INTEGER AS posicao_mensal,
      SUM(m.realizado) OVER () AS total_clinica
    FROM mensal m
  ),
  anual AS (
    SELECT
      p.id AS profile_id,
      COALESCE(SUM(r.realizado), 0) AS acumulado_anual,
      COALESCE(AVG(NULLIF(r.nota_feedback, 0)), 0) AS media_feedback
    FROM profissionais p
    LEFT JOIN public.resultados r
      ON r.profile_id = p.id
     AND r.ano = p_ano
    GROUP BY p.id
  ),
  anual_rank AS (
    SELECT
      a.*,
      ROW_NUMBER() OVER (ORDER BY a.acumulado_anual DESC, p.nome ASC)::INTEGER AS posicao_anual
    FROM anual a
    JOIN profissionais p ON p.id = a.profile_id
  )
  SELECT
    m.profile_id,
    m.nome,
    m.primeiro_nome,
    m.realizado,
    m.comissao_avaliacoes,
    m.nota_feedback,
    a.acumulado_anual,
    a.media_feedback,
    m.posicao_mensal,
    a.posicao_anual,
    m.total_clinica
  FROM mensal_rank m
  JOIN anual_rank a ON a.profile_id = m.profile_id
  WHERE m.profile_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_professional_dashboard(INTEGER, INTEGER) TO authenticated;

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
