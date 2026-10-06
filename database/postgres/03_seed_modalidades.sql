-- =====================================================================
--  03 - Carga inicial das modalidades (PostgreSQL)
--  As regras de jogo usadas pela aplicação ficam em config/modalidades.json
-- =====================================================================

INSERT INTO modalidade (codigo, nome, dezena_min, dezena_max, qtd_sorteadas, aposta_min, aposta_max) VALUES
    ('lotofacil', 'Lotofácil', 1, 25, 15, 15, 20),
    ('quina',     'Quina',     1, 80,  5,  5, 15),
    ('megasena',  'Mega-Sena', 1, 60,  6,  6, 20)
ON CONFLICT (codigo) DO NOTHING;
