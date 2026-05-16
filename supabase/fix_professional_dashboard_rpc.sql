-- Execute no Supabase SQL Editor.
-- Corrige a visao individual calculando posicoes no banco sem expor dados de outras profissionais.

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
