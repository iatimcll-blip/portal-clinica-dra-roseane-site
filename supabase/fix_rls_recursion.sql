-- Execute este arquivo no Supabase SQL Editor para corrigir a recursao nas politicas RLS.
-- Ele remove as politicas antigas e recria as regras usando uma funcao segura de admin.

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

DROP POLICY IF EXISTS "user_see_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_see_all_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
DROP POLICY IF EXISTS "admin_insert_profiles" ON profiles;
DROP POLICY IF EXISTS "authenticated_read_config" ON configuracoes_mes;
DROP POLICY IF EXISTS "admin_write_config" ON configuracoes_mes;
DROP POLICY IF EXISTS "user_see_own_resultados" ON resultados;
DROP POLICY IF EXISTS "admin_see_all_resultados" ON resultados;
DROP POLICY IF EXISTS "admin_write_resultados" ON resultados;

CREATE POLICY "user_see_own_profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "admin_see_all_profiles"
  ON profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin_update_profiles"
  ON profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_insert_profiles"
  ON profiles FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "authenticated_read_config"
  ON configuracoes_mes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_write_config"
  ON configuracoes_mes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "user_see_own_resultados"
  ON resultados FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "admin_see_all_resultados"
  ON resultados FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin_write_resultados"
  ON resultados FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
