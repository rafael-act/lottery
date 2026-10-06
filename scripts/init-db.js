/**
 * Cria a estrutura do banco executando os scripts de database/<cliente>.
 *   npm run db:init
 *
 * Para PostgreSQL o arquivo 01_create_database.sql (usuário e banco) deve ser
 * executado antes, manualmente, por um superusuário — veja o README.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config, ROOT_DIR } from '../src/config.js';
import { closeDb, getDb } from '../src/db/index.js';

const dir = path.join(ROOT_DIR, 'database', config.db.client);
const arquivos = readdirSync(dir)
  .filter((f) => f.endsWith('.sql') && !f.startsWith('01_create_database'))
  .sort();

console.log(`Banco: ${config.db.client}`);
const db = await getDb();
try {
  for (const arquivo of arquivos) {
    process.stdout.write(`  executando ${arquivo}... `);
    await db.exec(readFileSync(path.join(dir, arquivo), 'utf8'));
    console.log('ok');
  }
  console.log('Estrutura criada. Próximo passo: npm run db:import');
} catch (err) {
  console.error('\nFalha ao criar a estrutura:', err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
