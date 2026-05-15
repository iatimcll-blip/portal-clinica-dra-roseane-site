-- =====================================================
-- CRIAÇÃO DOS USUÁRIOS
-- Execute DEPOIS do schema.sql
-- Use o painel Authentication > Users do Supabase para criar
-- os usuários com os emails abaixo, depois rode este SQL
-- para definir os perfis corretamente.
-- =====================================================

-- PASSO 1: Crie os usuários no painel do Supabase:
-- Authentication → Users → Add User → Confirm email automaticamente
--
-- | Nome                              | Email                          | Senha          |
-- |-----------------------------------|--------------------------------|----------------|
-- | Admin (Dra. Roseane)              | admin@clinica.com              | Admin@2025!    |
-- | Kelly Lavinya Silva               | kelly@clinica.com              | Kelly@2025!    |
-- | Tayane Borges De Sousa            | tayane@clinica.com             | Tayane@2025!   |
-- | Maria Williara De Castro Silva    | maria@clinica.com              | Maria@2025!    |
-- | Erica Peres Ciriaco               | erica@clinica.com              | Erica@2025!    |
-- | Gilmara Sousa Cavalcante          | gilmara@clinica.com            | Gilmara@2025!  |

-- PASSO 2: Após criar os usuários, rode este SQL para configurar os perfis.
-- Substitua os UUIDs pelos IDs reais gerados pelo Supabase (Authentication > Users).

-- Exemplo (substitua os UUIDs abaixo):
/*
UPDATE profiles SET
  nome = 'Administrador',
  primeiro_nome = 'Admin',
  role = 'admin'
WHERE id = 'UUID_DO_ADMIN_AQUI';

UPDATE profiles SET
  nome = 'Kelly Lavinya Silva Nascimento Sousa',
  primeiro_nome = 'Kelly',
  role = 'user'
WHERE id = 'UUID_DA_KELLY_AQUI';

UPDATE profiles SET
  nome = 'Tayane Borges De Sousa',
  primeiro_nome = 'Tayane',
  role = 'user'
WHERE id = 'UUID_DA_TAYANE_AQUI';

UPDATE profiles SET
  nome = 'Maria Williara De Castro Silva',
  primeiro_nome = 'Maria',
  role = 'user'
WHERE id = 'UUID_DA_MARIA_AQUI';

UPDATE profiles SET
  nome = 'Erica Peres Ciriaco',
  primeiro_nome = 'Erica',
  role = 'user'
WHERE id = 'UUID_DA_ERICA_AQUI';

UPDATE profiles SET
  nome = 'Gilmara Sousa Cavalcante',
  primeiro_nome = 'Gilmara',
  role = 'user'
WHERE id = 'UUID_DA_GILMARA_AQUI';
*/
