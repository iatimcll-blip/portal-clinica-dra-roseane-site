-- Dados importados de D:\Metas_Clinica\painel_clinica_dra_roseane_v6.xlsx
-- Execute depois de criar os usuarios do Supabase e conferir a tabela profiles.

INSERT INTO configuracoes_mes (mes, ano, meta_clinica, meta_gatilho, meta_max, meta_individual_anual)
VALUES
  (1, 2025, 55000, 15000, 18000, 187000),
  (2, 2025, 45900, 13250, 15900, 187000),
  (3, 2025, 55000, 15000, 18000, 187000),
  (4, 2025, 55000, 15000, 18000, 187000),
  (5, 2025, 55000, 15000, 18000, 187000),
  (6, 2025, 70000, 24500, 35000, 187000),
  (7, 2025, 70000, 24500, 35000, 187000),
  (8, 2025, 70000, 24500, 35000, 187000),
  (9, 2025, 70000, 24500, 35000, 187000),
  (10, 2025, 80000, 24500, 35000, 187000),
  (11, 2025, 90000, 28000, 40000, 187000),
  (12, 2025, 90000, 28000, 40000, 187000)
ON CONFLICT (mes, ano) DO UPDATE SET
  meta_clinica = EXCLUDED.meta_clinica,
  meta_gatilho = EXCLUDED.meta_gatilho,
  meta_max = EXCLUDED.meta_max,
  meta_individual_anual = EXCLUDED.meta_individual_anual,
  updated_at = NOW();

WITH dados(nome, mes, realizado, comissao_avaliacoes) AS (
  VALUES
    ('Erica Peres Ciriaco', 1, 1304.00, 0.00),
    ('Erica Peres Ciriaco', 2, 1240.00, 0.00),
    ('Erica Peres Ciriaco', 3, 180.00, 0.00),
    ('Erica Peres Ciriaco', 4, 2690.90, 0.00),
    ('Erica Peres Ciriaco', 5, 0.00, 0.00),
    ('Gilmara Sousa Cavalcante', 1, 1400.00, 0.00),
    ('Gilmara Sousa Cavalcante', 2, 415.00, 0.00),
    ('Gilmara Sousa Cavalcante', 3, 120.00, 0.00),
    ('Gilmara Sousa Cavalcante', 4, 2546.90, 0.00),
    ('Gilmara Sousa Cavalcante', 5, 1062.90, 0.00),
    ('Kelly Lavinya Silva Nascimento Sousa', 1, 18415.60, 0.00),
    ('Kelly Lavinya Silva Nascimento Sousa', 2, 23073.90, 0.00),
    ('Kelly Lavinya Silva Nascimento Sousa', 3, 23781.50, 0.00),
    ('Kelly Lavinya Silva Nascimento Sousa', 4, 35615.70, 0.00),
    ('Kelly Lavinya Silva Nascimento Sousa', 5, 21245.69, 0.00),
    ('Maria Williara De Castro Silva', 1, 6168.00, 0.00),
    ('Maria Williara De Castro Silva', 2, 6488.89, 0.00),
    ('Maria Williara De Castro Silva', 3, 3479.50, 0.00),
    ('Maria Williara De Castro Silva', 4, 12909.19, 0.00),
    ('Maria Williara De Castro Silva', 5, 8247.99, 0.00),
    ('Tayane Borges De Sousa', 1, 15387.77, 0.00),
    ('Tayane Borges De Sousa', 2, 15648.10, 0.00),
    ('Tayane Borges De Sousa', 3, 18402.18, 0.00),
    ('Tayane Borges De Sousa', 4, 20824.19, 0.00),
    ('Tayane Borges De Sousa', 5, 4609.79, 0.00)
)
INSERT INTO resultados (profile_id, mes, ano, realizado, comissao_avaliacoes)
SELECT p.id, d.mes, 2025, d.realizado, d.comissao_avaliacoes
FROM dados d
JOIN profiles p ON lower(p.nome) = lower(d.nome)
ON CONFLICT (profile_id, mes, ano) DO UPDATE SET
  realizado = EXCLUDED.realizado,
  comissao_avaliacoes = EXCLUDED.comissao_avaliacoes,
  updated_at = NOW();
