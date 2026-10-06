import { Router } from 'express';
import { config, getModalidade, modalidades } from '../config.js';
import { conferirHistorico, gerarSugestoes, probabilidades, validarJogo } from '../services/generator.js';
import { carregarConcursos, premiacaoDosConcursos, ultimaData } from '../services/repository.js';
import { calcularEstatisticas, metricasJogo } from '../services/statistics.js';

export const api = Router();

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function lerAnos(req) {
  const anos = Number(req.query.anos ?? config.anosAnalise);
  return Number.isFinite(anos) && anos > 0 && anos <= 10 ? anos : config.anosAnalise;
}

/** Carrega a janela de análise: últimos N anos a partir do concurso mais recente. */
async function janela(codigo, anos) {
  const fim = await ultimaData(codigo);
  if (!fim) return { concursos: [], desde: null };
  const inicio = new Date(`${fim}T00:00:00Z`);
  inicio.setUTCFullYear(inicio.getUTCFullYear() - anos);
  const desde = inicio.toISOString().slice(0, 10);
  return { concursos: await carregarConcursos(codigo, desde), desde };
}

async function contexto(req) {
  const cfg = getModalidade(req.params.modalidade);
  const anos = lerAnos(req);
  const { concursos, desde } = await janela(cfg.codigo, anos);
  if (!concursos.length) {
    const err = new Error(`Sem resultados para ${cfg.nome}. Execute "npm run db:import".`);
    err.status = 404;
    throw err;
  }
  return { cfg, anos, desde, concursos, stats: calcularEstatisticas(cfg, concursos) };
}

api.get('/config', (req, res) => {
  res.json({
    anosAnalise: config.anosAnalise,
    modalidades: Object.entries(modalidades).map(([codigo, m]) => ({ codigo, ...m })),
  });
});

api.get(
  '/:modalidade/estatisticas',
  wrap(async (req, res) => {
    const { anos, desde, stats } = await contexto(req);
    res.json({ anos, desde, ...stats });
  }),
);

api.get(
  '/:modalidade/sugestoes',
  wrap(async (req, res) => {
    const { cfg, concursos, stats } = await contexto(req);
    const k = Math.min(cfg.apostaMax, Math.max(cfg.apostaMin, Number(req.query.dezenas) || cfg.apostaMin));
    const quantidade = Math.min(12, Math.max(1, Number(req.query.quantidade) || 5));
    const semente = req.query.semente !== undefined ? Number(req.query.semente) : undefined;
    res.json({ dezenasPorJogo: k, ...gerarSugestoes(cfg, stats, concursos, { dezenas: k, quantidade, semente }) });
  }),
);

api.post(
  '/:modalidade/conferir',
  wrap(async (req, res) => {
    const { cfg, concursos, stats } = await contexto(req);
    const dezenas = (req.body?.dezenas ?? []).map(Number);
    const erro = validarJogo(cfg, dezenas);
    if (erro) return res.status(400).json({ erro });
    dezenas.sort((a, b) => a - b);
    const freq = new Map(stats.dezenas.map((d) => [d.dezena, d]));
    res.json({
      dezenas,
      metricas: metricasJogo(dezenas, cfg),
      ocorrencias: dezenas.map((d) => freq.get(d)),
      historico: conferirHistorico(cfg, dezenas, concursos),
      probabilidades: probabilidades(cfg, dezenas.length),
    });
  }),
);

api.get(
  '/:modalidade/concursos',
  wrap(async (req, res) => {
    const { concursos } = await contexto(req);
    const limite = Math.min(100, Number(req.query.limite) || 20);
    const ultimos = concursos.slice(-limite).reverse();
    const premios = await premiacaoDosConcursos(req.params.modalidade, ultimos.map((c) => c.numero));
    res.json(ultimos.map((c) => ({ ...c, premiacao: premios.get(c.numero) ?? [] })));
  }),
);
