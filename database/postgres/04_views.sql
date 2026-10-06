-- =====================================================================
--  04 - Visões de apoio para consultas (PostgreSQL)
-- =====================================================================

-- Ocorrências de cada dezena por modalidade (todo o histórico importado)
CREATE OR REPLACE VIEW vw_frequencia_dezena AS
SELECT m.codigo                         AS modalidade,
       d.dezena,
       COUNT(*)                         AS ocorrencias,
       ROUND(100.0 * COUNT(*) / t.total_concursos, 2) AS incidencia_pct,
       MAX(c.numero)                    AS ultimo_concurso,
       MAX(c.data_apuracao)             AS ultima_data
  FROM concurso_dezena d
  JOIN concurso   c ON c.id = d.concurso_id
  JOIN modalidade m ON m.id = c.modalidade_id
  JOIN (SELECT modalidade_id, COUNT(*) AS total_concursos
          FROM concurso GROUP BY modalidade_id) t ON t.modalidade_id = m.id
 GROUP BY m.codigo, d.dezena, t.total_concursos;

-- Concursos com as dezenas em uma única coluna
CREATE OR REPLACE VIEW vw_concurso_resultado AS
SELECT m.codigo AS modalidade,
       c.numero,
       c.data_apuracao,
       c.acumulado,
       STRING_AGG(LPAD(d.dezena::TEXT, 2, '0'), '-' ORDER BY d.dezena) AS dezenas
  FROM concurso c
  JOIN modalidade m      ON m.id = c.modalidade_id
  JOIN concurso_dezena d ON d.concurso_id = c.id
 GROUP BY m.codigo, c.numero, c.data_apuracao, c.acumulado;
