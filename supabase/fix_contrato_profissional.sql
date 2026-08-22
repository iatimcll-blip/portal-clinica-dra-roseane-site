-- =====================================================
-- CONTRATO DA PROFISSIONAL (CLT ou CNPJ)
-- Execute no SQL Editor do Supabase
-- =====================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS contrato TEXT NOT NULL DEFAULT 'clt' CHECK (contrato IN ('clt', 'cnpj'));
