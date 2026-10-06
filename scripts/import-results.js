/**
 * Importa os resultados oficiais da API pública da Caixa.
 *
 *   npm run db:import                         -> todas as modalidades, IMPORT_ANOS anos
 *   npm run db:import -- --modalidade quina   -> somente uma modalidade
 *   npm run db:import -- --anos 3             -> sobrescreve o período
 *
 * A importação é incremental: concursos já gravados são ignorados, então
 * o script pode ser agendado (ex.: diariamente) para manter a base em dia.
 */
import { parseArgs } from 'node:util';
import { config, getModalidade, modalidades } from '../src/config.js';
import { closeDb } from '../src/db/index.js';
import { getModalidadeId, numerosExistentes, salvarConcurso } from '../src/services/repository.js';

const { values: args } = parseArgs({
  options: {
    modalidade: { type: 'string' },
    anos: { type: 'string' },
  },
});

const { apiUrl, concorrencia, pausaMs, tentativas } = config.importacao;
const anos = Number(args.anos ?? config.importacao.anos);
const codigos = args.modalidade ? [getModalidade(args.modalidade).codigo] : Object.keys(modalidades);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function buscar(slug, numero = '') {
  const url = `${apiUrl}/${slug}/${numero}`;
  for (let tentativa = 1; ; tentativa++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (loterias-estatistica)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      if (tentativa >= tentativas) throw new Error(`${url}: ${err.cause?.message ?? err.message}`);
      await sleep(1000 * 2 ** (tentativa - 1));
    }
  }
}

/** 'dd/mm/aaaa' -> 'aaaa-mm-dd' */
const dataIso = (br) => br.split('/').reverse().join('-');

function converter(json) {
  const ordem = (json.dezenasSorteadasOrdemSorteio ?? []).map(Number);
  return {
    numero: json.numero,
    data: dataIso(json.dataApuracao),
    acumulado: Boolean(json.acumulado),
    valorArrecadado: json.valorArrecadado ?? null,
    valorEstimadoProximo: json.valorEstimadoProximoConcurso ?? null,
    dezenas: json.listaDezenas.map((d) => {
      const dezena = Number(d);
      const pos = ordem.indexOf(dezena);
      return { dezena, ordem: pos >= 0 ? pos + 1 : null };
    }),
    premiacao: (json.listaRateioPremio ?? []).map((p) => ({
      faixa: p.faixa,
      descricao: p.descricaoFaixa,
      ganhadores: p.numeroDeGanhadores ?? 0,
      valorPremio: p.valorPremio ?? 0,
    })),
  };
}

async function importar(codigo) {
  const cfg = getModalidade(codigo);
  const modalidadeId = await getModalidadeId(codigo);
  const existentes = await numerosExistentes(modalidadeId);

  const ultimo = await buscar(cfg.apiSlug);
  const limite = new Date(dataIso(ultimo.dataApuracao));
  limite.setFullYear(limite.getFullYear() - anos);
  const dataLimite = limite.toISOString().slice(0, 10);

  console.log(`\n${cfg.nome}: último concurso ${ultimo.numero} (${ultimo.dataApuracao}), importando desde ${dataLimite}`);

  let novos = 0;
  let falhas = 0;
  let numero = ultimo.numero;
  let fim = false;

  while (!fim && numero > 0) {
    const lote = [];
    while (lote.length < concorrencia && numero > 0) {
      if (!existentes.has(numero)) lote.push(numero);
      numero--;
    }
    if (!lote.length) {
      // Tudo neste trecho já existe; segue procurando lacunas até a data limite.
      continue;
    }

    const resultados = await Promise.allSettled(
      lote.map((n) => (n === ultimo.numero ? Promise.resolve(ultimo) : buscar(cfg.apiSlug, n))),
    );

    // Gravação sequencial (o SQLite usa uma única conexão).
    for (const r of resultados) {
      if (r.status === 'rejected') {
        falhas++;
        console.warn(`  falha: ${r.reason.message}`);
        continue;
      }
      const concurso = converter(r.value);
      if (concurso.data < dataLimite) {
        fim = true;
        continue;
      }
      if (await salvarConcurso(modalidadeId, concurso)) novos++;
    }
    process.stdout.write(`\r  concursos novos: ${novos}  (posição atual: ${numero})   `);
    await sleep(pausaMs);
  }
  console.log(`\n  concluído: ${novos} novo(s), ${falhas} falha(s)`);
  return falhas;
}

let totalFalhas = 0;
try {
  for (const codigo of codigos) totalFalhas += await importar(codigo);
  if (totalFalhas) {
    console.log(`\n${totalFalhas} concurso(s) falharam. Rode o comando novamente para completar.`);
    process.exitCode = 2;
  }
} catch (err) {
  console.error('\nErro na importação:', err.message);
  console.error('Se houver proxy/certificado corporativo, configure NODE_EXTRA_CA_CERTS (veja o README).');
  process.exitCode = 1;
} finally {
  await closeDb();
}
