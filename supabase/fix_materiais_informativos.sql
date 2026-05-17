-- Execute no Supabase SQL Editor.
-- Cria area de anexos informativos para o painel admin e painel individual.

CREATE TABLE IF NOT EXISTS public.materiais_informativos (
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

ALTER TABLE public.materiais_informativos ENABLE ROW LEVEL SECURITY;

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
  USING (public.is_admin());

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
