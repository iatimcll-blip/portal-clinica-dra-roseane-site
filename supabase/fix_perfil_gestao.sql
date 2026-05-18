-- Execute no Supabase SQL Editor.
-- Cria o segundo perfil administrativo: gestao.
-- Gestao tem a mesma visualizacao do admin, mas sem permissoes de escrita.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'gestao', 'user'));

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

DROP POLICY IF EXISTS "admin_see_all_profiles" ON public.profiles;
CREATE POLICY "admin_see_all_profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin_or_gestao());

DROP POLICY IF EXISTS "admin_see_all_resultados" ON public.resultados;
CREATE POLICY "admin_see_all_resultados"
  ON public.resultados FOR SELECT
  USING (public.is_admin_or_gestao());

DROP POLICY IF EXISTS "admin_read_all_materials" ON public.materiais_informativos;
CREATE POLICY "admin_read_all_materials"
  ON public.materiais_informativos FOR SELECT TO authenticated
  USING (public.is_admin_or_gestao());

DROP POLICY IF EXISTS "admin_read_all_material_reads" ON public.materiais_leituras;
CREATE POLICY "admin_read_all_material_reads"
  ON public.materiais_leituras FOR SELECT TO authenticated
  USING (public.is_admin_or_gestao());

DROP POLICY IF EXISTS "admin_read_audit_events" ON public.auditoria_eventos;
CREATE POLICY "admin_read_audit_events"
  ON public.auditoria_eventos FOR SELECT TO authenticated
  USING (public.is_admin_or_gestao());

-- Escrita continua exclusiva do admin por public.is_admin().
-- Politicas de INSERT/UPDATE/DELETE existentes nao sao alteradas.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');

  IF requested_role NOT IN ('admin', 'gestao', 'user') THEN
    requested_role := 'user';
  END IF;

  INSERT INTO public.profiles (id, nome, primeiro_nome, role, ativo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'primeiro_nome', split_part(NEW.email, '@', 1)),
    requested_role,
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
