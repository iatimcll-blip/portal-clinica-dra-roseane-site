-- Adiciona suporte a materiais individuais/multidestinatarios e à categoria Links.
-- Execute no Supabase SQL Editor.

ALTER TABLE public.materiais_informativos
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_profile_ids UUID[],
  ADD COLUMN IF NOT EXISTS link_url TEXT;

UPDATE public.materiais_informativos
SET target_profile_ids = ARRAY[profile_id]::UUID[]
WHERE profile_id IS NOT NULL
  AND (target_profile_ids IS NULL OR cardinality(target_profile_ids) = 0);

-- Recria a policy de leitura para que profissionais vejam apenas seus materiais:
-- target_profile_ids vazio/nulo + profile_id nulo = todas;
-- target_profile_ids contem auth.uid() = multidestinatario;
-- profile_id = auth.uid() = compatibilidade com materiais individuais antigos.
DROP POLICY IF EXISTS "authenticated_read_active_materials" ON public.materiais_informativos;

CREATE POLICY "authenticated_read_active_materials"
  ON public.materiais_informativos FOR SELECT TO authenticated
  USING (
    ativo = true
    AND (
      (
        profile_id IS NULL
        AND (target_profile_ids IS NULL OR cardinality(target_profile_ids) = 0)
      )
      OR auth.uid() = ANY(target_profile_ids)
      OR profile_id = auth.uid()
      OR public.is_admin_or_gestao()
    )
  );
