import express from 'express';
import path from 'node:path';
import { config, ROOT_DIR } from './config.js';
import { closeDb } from './db/index.js';
import { api } from './routes/api.js';

const app = express();
app.use(express.json());
app.use('/api', api);
app.use(express.static(path.join(ROOT_DIR, 'public')));

app.use((err, req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ erro: err.message });
});

const server = app.listen(config.port, () => {
  console.log(`Loterias • Estatística rodando em http://localhost:${config.port} (banco: ${config.db.client})`);
});

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => server.close(() => closeDb().finally(() => process.exit(0))));
}
