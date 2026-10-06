-- =====================================================================
--  02 - Tabelas (PostgreSQL)
--  psql -U loterias_app -d loterias -f database/postgres/02_create_tables.sql
--  (ou: npm run db:init com DB_CLIENT=postgres)
-- =====================================================================

-- Modalidades de loteria (Lotofácil, Quina, Mega-Sena)
CREATE TABLE IF NOT EXISTS modalidade (
    id              SERIAL PRIMARY KEY,
    codigo          VARCHAR(30)  NOT NULL UNIQUE,
    nome            VARCHAR(60)  NOT NULL,
    dezena_min      SMALLINT     NOT NULL,
    dezena_max      SMALLINT     NOT NULL,
    qtd_sorteadas   SMALLINT     NOT NULL,
    aposta_min      SMALLINT     NOT NULL,
    aposta_max      SMALLINT     NOT NULL,
    criado_em       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Um registro por concurso sorteado
CREATE TABLE IF NOT EXISTS concurso (
    id                      SERIAL PRIMARY KEY,
    modalidade_id           INTEGER       NOT NULL REFERENCES modalidade (id),
    numero                  INTEGER       NOT NULL,
    data_apuracao           DATE          NOT NULL,
    acumulado               BOOLEAN       NOT NULL DEFAULT FALSE,
    valor_arrecadado        NUMERIC(16,2),
    valor_estimado_proximo  NUMERIC(16,2),
    importado_em            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concurso_modalidade_numero UNIQUE (modalidade_id, numero)
);

CREATE INDEX IF NOT EXISTS ix_concurso_modalidade_data
    ON concurso (modalidade_id, data_apuracao);

-- Dezenas sorteadas em cada concurso (uma linha por dezena)
CREATE TABLE IF NOT EXISTS concurso_dezena (
    concurso_id     INTEGER  NOT NULL REFERENCES concurso (id) ON DELETE CASCADE,
    dezena          SMALLINT NOT NULL,
    ordem_sorteio   SMALLINT,
    PRIMARY KEY (concurso_id, dezena)
);

CREATE INDEX IF NOT EXISTS ix_concurso_dezena_dezena
    ON concurso_dezena (dezena);

-- Rateio dos prêmios por faixa (1º, 2º, 3º prêmio...)
CREATE TABLE IF NOT EXISTS concurso_premiacao (
    concurso_id     INTEGER       NOT NULL REFERENCES concurso (id) ON DELETE CASCADE,
    faixa           SMALLINT      NOT NULL,
    descricao       VARCHAR(60),
    ganhadores      INTEGER       NOT NULL DEFAULT 0,
    valor_premio    NUMERIC(16,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (concurso_id, faixa)
);
