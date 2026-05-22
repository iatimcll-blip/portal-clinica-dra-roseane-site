-- Execute no Supabase SQL Editor.
-- Cria e corrige a area de materiais, categorias, aceite e armazenamento.

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

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_gestao() TO authenticated;

CREATE TABLE IF NOT EXISTS public.materiais_informativos (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL DEFAULT 'Comunicados',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_type TEXT,
  file_size BIGINT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.materiais_informativos
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Comunicados';

UPDATE public.materiais_informativos
SET categoria = 'Comunicados'
WHERE categoria IS NULL OR btrim(categoria) = '';

CREATE TABLE IF NOT EXISTS public.materiais_leituras (
  material_id BIGINT NOT NULL REFERENCES public.materiais_informativos(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (material_id, profile_id)
);

ALTER TABLE public.materiais_informativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_leituras ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais_informativos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.materiais_informativos_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.materiais_leituras TO authenticated;

DROP POLICY IF EXISTS "authenticated_read_active_materials" ON public.materiais_informativos;
DROP POLICY IF EXISTS "admin_read_all_materials" ON public.materiais_informativos;
DROP POLICY IF EXISTS "admin_insert_materials" ON public.materiais_informativos;
DROP POLICY IF EXISTS "admin_update_materials" ON public.materiais_informativos;
DROP POLICY IF EXISTS "admin_delete_materials" ON public.materiais_informativos;

CREATE POLICY "authenticated_read_active_materials"
  ON public.materiais_informativos FOR SELECT TO authenticated
  USING (ativo = true);

CREATE POLICY "admin_read_all_materials"
  ON public.materiais_informativos FOR SELECT TO authenticated
  USING (public.is_admin_or_gestao());

CREATE POLICY "admin_insert_materials"
  ON public.materiais_informativos FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_materials"
  ON public.materiais_informativos FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_materials"
  ON public.materiais_informativos FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "user_read_own_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "admin_read_all_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "user_insert_own_material_reads" ON public.materiais_leituras;
DROP POLICY IF EXISTS "user_update_own_material_reads" ON public.materiais_leituras;

CREATE POLICY "user_read_own_material_reads"
  ON public.materiais_leituras FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin_or_gestao());

CREATE POLICY "admin_read_all_material_reads"
  ON public.materiais_leituras FOR SELECT TO authenticated
  USING (public.is_admin_or_gestao());

CREATE POLICY "user_insert_own_material_reads"
  ON public.materiais_leituras FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "user_update_own_material_reads"
  ON public.materiais_leituras FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('materiais-informativos', 'materiais-informativos', false, 52428800)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800;

DROP POLICY IF EXISTS "authenticated_read_material_files" ON storage.objects;
DROP POLICY IF EXISTS "admin_insert_material_files" ON storage.objects;
DROP POLICY IF EXISTS "admin_update_material_files" ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_material_files" ON storage.objects;

CREATE POLICY "authenticated_read_material_files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'materiais-informativos');

CREATE POLICY "admin_insert_material_files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'materiais-informativos' AND public.is_admin());

CREATE POLICY "admin_update_material_files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'materiais-informativos' AND public.is_admin())
  WITH CHECK (bucket_id = 'materiais-informativos' AND public.is_admin());

CREATE POLICY "admin_delete_material_files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'materiais-informativos' AND public.is_admin());
