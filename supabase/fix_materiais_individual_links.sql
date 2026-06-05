-- Adiciona suporte a materiais individuais (por profissional) e à categoria Links.
-- Execute no Supabase SQL Editor.

ALTER TABLE public.materiais_informativos
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link_url TEXT;

-- Recria a policy de leitura para que profissionais vejam apenas seus materiais
-- (profile_id IS NULL = para todas; profile_id = auth.uid() = individual).
DROP POLICY IF EXISTS "authenticated_read_active_materials" ON public.materiais_informativos;

CREATE POLICY "authenticated_read_active_materials"
  ON public.materiais_informativos FOR SELECT TO authenticated
  USING (
    ativo = true
    AND (
      profile_id IS NULL
      OR profile_id = auth.uid()
      OR public.is_admin_or_gestao()
    )
  );
