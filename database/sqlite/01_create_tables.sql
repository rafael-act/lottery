-- =====================================================================
--  Estrutura completa para SQLite (desenvolvimento / uso local)
--  Executado por: npm run db:init (com DB_CLIENT=sqlite)
-- =====================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS modalidade (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo          TEXT    NOT NULL UNIQUE,
    nome            TEXT    NOT NULL,
    dezena_min      INTEGER NOT NULL,
    dezena_max      INTEGER NOT NULL,
    qtd_sorteadas   INTEGER NOT NULL,
    aposta_min      INTEGER NOT NULL,
    aposta_max      INTEGER NOT NULL,
    criado_em       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS concurso (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    modalidade_id           INTEGER NOT NULL REFERENCES modalidade (id),
    numero                  INTEGER NOT NULL,
    data_apuracao           TEXT    NOT NULL,          -- AAAA-MM-DD
    acumulado               INTEGER NOT NULL DEFAULT 0,
    valor_arrecadado        REAL,
    valor_estimado_proximo  REAL,
    importado_em            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concurso_modalidade_numero UNIQUE (modalidade_id, numero)
);

CREATE INDEX IF NOT EXISTS ix_concurso_modalidade_data
    ON concurso (modalidade_id, data_apuracao);

CREATE TABLE IF NOT EXISTS concurso_dezena (
    concurso_id     INTEGER NOT NULL REFERENCES concurso (id) ON DELETE CASCADE,
    dezena          INTEGER NOT NULL,
    ordem_sorteio   INTEGER,
    PRIMARY KEY (concurso_id, dezena)
);

CREATE INDEX IF NOT EXISTS ix_concurso_dezena_dezena
    ON concurso_dezena (dezena);

CREATE TABLE IF NOT EXISTS concurso_premiacao (
    concurso_id     INTEGER NOT NULL REFERENCES concurso (id) ON DELETE CASCADE,
    faixa           INTEGER NOT NULL,
    descricao       TEXT,
    ganhadores      INTEGER NOT NULL DEFAULT 0,
    valor_premio    REAL    NOT NULL DEFAULT 0,
    PRIMARY KEY (concurso_id, faixa)
);

INSERT INTO modalidade (codigo, nome, dezena_min, dezena_max, qtd_sorteadas, aposta_min, aposta_max) VALUES
    ('lotofacil', 'Lotofácil', 1, 25, 15, 15, 20),
    ('quina',     'Quina',     1, 80,  5,  5, 15),
    ('megasena',  'Mega-Sena', 1, 60,  6,  6, 20)
ON CONFLICT (codigo) DO NOTHING;

DROP VIEW IF EXISTS vw_frequencia_dezena;
CREATE VIEW vw_frequencia_dezena AS
SELECT m.codigo                 AS modalidade,
       d.dezena,
       COUNT(*)                 AS ocorrencias,
       ROUND(100.0 * COUNT(*) / t.total_concursos, 2) AS incidencia_pct,
       MAX(c.numero)            AS ultimo_concurso,
       MAX(c.data_apuracao)     AS ultima_data
  FROM concurso_dezena d
  JOIN concurso   c ON c.id = d.concurso_id
  JOIN modalidade m ON m.id = c.modalidade_id
  JOIN (SELECT modalidade_id, COUNT(*) AS total_concursos
          FROM concurso GROUP BY modalidade_id) t ON t.modalidade_id = m.id
 GROUP BY m.codigo, d.dezena, t.total_concursos;
