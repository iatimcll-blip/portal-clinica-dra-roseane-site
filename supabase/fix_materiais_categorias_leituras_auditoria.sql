-- Execute no Supabase SQL Editor.
-- Aplica categorias de materiais, confirmacao de leitura, auditoria e corrige o ranking individual.

ALTER TABLE public.materiais_informativos
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Comunicados';

UPDATE public.materiais_informativos
SET categoria = 'Comunicados'
WHERE categoria IS NULL OR btrim(categoria) = '';

CREATE TABLE IF NOT EXISTS public.materiais_leituras (
  material_id INTEGER NOT NULL REFERENCES public.materiais_informativos(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, profile_id)
);

ALTER TABLE public.materiais_leituras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "admin_read_all_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "user_insert_own_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "user_update_own_material_reads" ON public.materiais_leituras;

CREATE POLICY "user_read_own_material_reads"
  ON public.materiais_leituras FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "admin_read_all_material_reads"
  ON public.materiais_leituras FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "user_insert_own_material_reads"
  ON public.materiais_leituras FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "user_update_own_material_reads"
  ON public.materiais_leituras FOR UPDATE TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

CREATE TABLE IF NOT EXISTS public.auditoria_eventos (
  id BIGSERIAL PRIMARY KEY,
  tabela TEXT NOT NULL,
  registro_id TEXT,
  acao TEXT NOT NULL,
  detalhes JSONB,
  actor_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_audit_events" ON public.auditoria_eventos;
CREATE POLICY "admin_read_audit_events"
  ON public.auditoria_eventos FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.registrar_auditoria_evento()
RETURNS TRIGGER AS $$
DECLARE
  v_registro_id TEXT;
  v_detalhes JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_registro_id := OLD.id::TEXT;
    v_detalhes := to_jsonb(OLD);
  ELSE
    v_registro_id := NEW.id::TEXT;
    v_detalhes := to_jsonb(NEW);
  END IF;

  INSERT INTO public.auditoria_eventos (tabela, registro_id, acao, detalhes, actor_id)
  VALUES (TG_TABLE_NAME, v_registro_id, TG_OP, v_detalhes, auth.uid());

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS auditoria_resultados ON public.resultados;
CREATE TRIGGER auditoria_resultados
  AFTER INSERT OR UPDATE OR DELETE ON public.resultados
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_configuracoes_mes ON public.configuracoes_mes;
CREATE TRIGGER auditoria_configuracoes_mes
  AFTER INSERT OR UPDATE OR DELETE ON public.configuracoes_mes
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_materiais_informativos ON public.materiais_informativos;
CREATE TRIGGER auditoria_materiais_informativos
  AFTER INSERT OR UPDATE OR DELETE ON public.materiais_informativos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_evento();

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
