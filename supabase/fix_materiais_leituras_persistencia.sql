-- Execute no Supabase SQL Editor se o aceite de materiais voltar a aparecer
-- em outro navegador ou computador. Este script garante a tabela definitiva
-- de ciencia por material e por usuario.

CREATE TABLE IF NOT EXISTS public.materiais_leituras (
  material_id INTEGER NOT NULL REFERENCES public.materiais_informativos(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, profile_id)
);

ALTER TABLE public.materiais_leituras ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.materiais_leituras TO authenticated;

DROP POLICY IF EXISTS "user_read_own_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "admin_read_all_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "user_insert_own_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "user_update_own_material_reads" ON public.materiais_leituras;

CREATE POLICY "user_read_own_material_reads"
  ON public.materiais_leituras FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "admin_read_all_material_reads"
  ON public.materiais_leituras FOR SELECT TO authenticated
  USING (public.is_admin_or_gestao());

CREATE POLICY "user_insert_own_material_reads"
  ON public.materiais_leituras FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "user_update_own_material_reads"
  ON public.materiais_leituras FOR UPDATE TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());
