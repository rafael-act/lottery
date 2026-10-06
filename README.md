# Loterias • Análise Estatística

Sistema que analisa os resultados dos **últimos 2 anos** (configurável) da **Lotofácil**, **Quina** e **Mega-Sena** e
usa **média, moda e mediana** para sugerir jogos voltados ao 1º, 2º e 3º prêmios de cada modalidade.

> ⚠️ Os sorteios são aleatórios e independentes. As estatísticas descrevem o passado e **não aumentam** a
> probabilidade de acerto. O sistema exibe a probabilidade real de cada faixa ao lado das sugestões.

## Funcionalidades

| Tela | O que mostra |
|---|---|
| **Indicadores** | concursos analisados, período, volume de ocorrências (total de dezenas sorteadas), média/mediana/moda das ocorrências por dezena, último resultado |
| **Ocorrências** | gráfico de ocorrências por dezena (com linhas de média e mediana), mapa de calor do volante, tabela com ocorrências, incidência (% dos concursos), desvio vs. esperado, atraso atual, maior atraso e classificação quente/neutra/fria; tabela de incidências (quantas dezenas saíram N vezes) |
| **Padrões dos sorteios** | média, mediana, moda, desvio-padrão e histograma de: soma, pares, baixas, primos e repetidas do concurso anterior; estatística por posição |
| **Sugestões de jogos** | jogos pela **moda** (mais frequentes), **mediana** (posição a posição) e **média** (equilibrados), com quantas vezes cada jogo teria feito 1º/2º/3º prêmio no período e a probabilidade real |
| **Analisar meu jogo** | marque as dezenas no volante e compare o jogo com o histórico |
| **Últimos concursos** | resultados recentes, ganhadores do 1º prêmio e acúmulo |

## Tecnologias

- **Backend:** Node.js 22+ (Express)
- **Banco:** SQLite (embutido no Node, sem instalação) ou PostgreSQL
- **Frontend:** Vue 3 + Vuetify 3 (Material Design, tema verde claro/escuro) + Chart.js — sem etapa de build
- **Fonte de dados:** API pública de resultados da Caixa

## Instalação

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Edite o `.env` (veja abaixo) e então:

```bash
npm run db:init             # cria tabelas, carga de modalidades e visões
npm run db:import           # importa os resultados dos últimos IMPORT_ANOS anos
npm start                   # http://localhost:3000
```

### Usando PostgreSQL

1. Ajuste usuário/senha em `database/postgres/01_create_database.sql` e execute como superusuário:
   ```bash
   psql -U postgres -f database/postgres/01_create_database.sql
   ```
2. No `.env`: `DB_CLIENT=postgres` e preencha `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`.
3. `npm run db:init` executa `02_create_tables.sql`, `03_seed_modalidades.sql` e `04_views.sql`
   (também podem ser executados manualmente pelo `psql`).

## Arquivos de configuração

| Arquivo | Para quê |
|---|---|
| `.env` | porta, banco (SQLite/PostgreSQL), janela de análise (`ANOS_ANALISE`), parâmetros da importação |
| `config/modalidades.json` | regras de cada modalidade: universo de dezenas, quantidade sorteada, mín./máx. de dezenas por aposta e faixas de prêmio (1º, 2º, 3º) |
| `database/postgres/*.sql` | scripts do banco PostgreSQL |
| `database/sqlite/01_create_tables.sql` | script do banco SQLite |

## Importação

```bash
npm run db:import                          # todas as modalidades
npm run db:import -- --modalidade quina    # apenas uma
npm run db:import -- --anos 3              # outro período
```

A importação é **incremental** (concursos já gravados são ignorados) — agende-a diariamente
(Agendador de Tarefas do Windows ou cron) para manter a base atualizada.

Se a rede usar proxy/certificado corporativo e aparecer erro de certificado, aponte o certificado da empresa:
`NODE_EXTRA_CA_CERTS=C:\caminho\certificado.pem`.

## Como as sugestões são calculadas

- **Moda:** as *k* dezenas que mais vezes saíram no período.
- **Mediana:** ordena as dezenas de cada sorteio e usa a mediana de cada posição (1ª, 2ª, …); para apostas maiores que o
  sorteio, completa com as mais frequentes.
- **Média:** sorteio ponderado pelas ocorrências, aceitando só jogos com soma dentro de *média ± ½ desvio-padrão* e
  quantidade de pares e baixas próxima da mediana histórica.

Cada jogo é conferido contra todos os concursos do período (quantas vezes faria 1º, 2º e 3º prêmio). A semente da geração é
exibida e pode ser reutilizada em `GET /api/{modalidade}/sugestoes?semente=N` para reproduzir os mesmos jogos.

## API

| Método | Rota | Parâmetros |
|---|---|---|
| GET | `/api/config` | — |
| GET | `/api/{modalidade}/estatisticas` | `anos` |
| GET | `/api/{modalidade}/sugestoes` | `anos`, `dezenas`, `quantidade`, `semente` |
| POST | `/api/{modalidade}/conferir` | `anos`; corpo `{ "dezenas": [1, 2, ...] }` |
| GET | `/api/{modalidade}/concursos` | `anos`, `limite` |

`{modalidade}`: `lotofacil`, `quina` ou `megasena`.

## Estrutura

```
config/modalidades.json      regras das modalidades
database/postgres/           scripts PostgreSQL (01 a 04)
database/sqlite/             script SQLite
scripts/init-db.js           cria a estrutura do banco
scripts/import-results.js    importa resultados da Caixa
src/server.js                servidor Express
src/routes/api.js            rotas da API
src/services/statistics.js   média, moda, mediana, ocorrências, incidências
src/services/generator.js    geração e conferência de jogos
src/services/repository.js   consultas ao banco
public/                      interface (Vue + Vuetify)
```
