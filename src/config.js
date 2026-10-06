import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = (name, fallback) => process.env[name] ?? fallback;
const envInt = (name, fallback) => Number.parseInt(env(name, fallback), 10);

export const config = {
  port: envInt('PORT', 3000),
  db: {
    client: env('DB_CLIENT', 'sqlite').toLowerCase(),
    sqliteFile: path.resolve(ROOT_DIR, env('SQLITE_FILE', './data/loterias.db')),
    postgres: {
      host: env('PG_HOST', 'localhost'),
      port: envInt('PG_PORT', 5432),
      database: env('PG_DATABASE', 'loterias'),
      user: env('PG_USER', 'loterias_app'),
      password: env('PG_PASSWORD', ''),
      ssl: env('PG_SSL', 'false') === 'true' ? { rejectUnauthorized: false } : false,
    },
  },
  anosAnalise: envInt('ANOS_ANALISE', 2),
  importacao: {
    apiUrl: env('CAIXA_API_URL', 'https://servicebus2.caixa.gov.br/portaldeloterias/api').replace(/\/$/, ''),
    anos: envInt('IMPORT_ANOS', 2),
    concorrencia: envInt('IMPORT_CONCORRENCIA', 4),
    pausaMs: envInt('IMPORT_PAUSA_MS', 300),
    tentativas: envInt('IMPORT_TENTATIVAS', 4),
  },
};

/** Regras de cada modalidade (editáveis em config/modalidades.json). */
export const modalidades = JSON.parse(
  readFileSync(path.join(ROOT_DIR, 'config', 'modalidades.json'), 'utf8'),
);

export function getModalidade(codigo) {
  const cfg = modalidades[codigo];
  if (!cfg) {
    const err = new Error(`Modalidade desconhecida: ${codigo}`);
    err.status = 404;
    throw err;
  }
  return { codigo, ...cfg };
}
