/**
 * Geração de jogos sugeridos a partir das estatísticas.
 *
 *  - Moda      : as dezenas que mais vezes saíram no período.
 *  - Mediana   : a mediana de cada posição das dezenas ordenadas dos sorteios.
 *  - Média     : sorteio ponderado pelas ocorrências, aceitando apenas jogos cuja
 *                soma, pares e baixas fiquem próximos da média/mediana histórica.
 *
 * Cada jogo é conferido contra todos os concursos do período (quantas vezes
 * teria feito 1º, 2º e 3º prêmio) e recebe a probabilidade matemática real.
 */
import { metricasJogo, universo } from './statistics.js';

export function gerarSugestoes(cfg, stats, concursos, { dezenas: k, quantidade, semente }) {
  const seed = Number.isFinite(semente) ? semente : Math.floor(Math.random() * 2 ** 31);
  const rand = mulberry32(seed);
  const s = cfg.qtdSorteadas;
  const escala = k / s;

  const porFrequencia = [...stats.dezenas].sort((a, b) => b.ocorrencias - a.ocorrencias || a.atraso - b.atraso);
  const jogos = [];
  const assinaturas = new Set();
  const adicionar = (estrategia, titulo, descricao, lista) => {
    const ordenadas = [...lista].sort((a, b) => a - b);
    const chave = ordenadas.join('-');
    if (assinaturas.has(chave)) return false;
    assinaturas.add(chave);
    jogos.push({ estrategia, titulo, descricao, dezenas: ordenadas });
    return true;
  };

  // 1) Moda - dezenas mais frequentes
  adicionar(
    'moda',
    'Moda — dezenas mais frequentes',
    `As ${k} dezenas com maior número de ocorrências no período.`,
    porFrequencia.slice(0, k).map((d) => d.dezena),
  );

  // 2) Mediana posicional
  if (quantidade > 1) {
    const escolhidas = new Set();
    for (const pos of stats.posicional) escolhidas.add(maisProximaLivre(Math.round(pos.mediana), escolhidas, cfg));
    for (const d of porFrequencia) {
      if (escolhidas.size >= k) break;
      escolhidas.add(d.dezena);
    }
    adicionar(
      'mediana',
      'Mediana — posição a posição',
      'Mediana de cada posição das dezenas ordenadas dos sorteios' +
        (k > s ? `, completada com as mais frequentes.` : '.'),
      [...escolhidas],
    );
  }

  // 3) Média - jogos equilibrados
  const { soma, pares, baixas } = stats.padroes;
  const alvo = {
    somaMin: (soma.media - soma.desvioPadrao * 0.5) * escala,
    somaMax: (soma.media + soma.desvioPadrao * 0.5) * escala,
    pares: pares.mediana * escala,
    baixas: baixas.mediana * escala,
  };
  const pesos = stats.dezenas.map((d) => ({ dezena: d.dezena, peso: Math.max(d.ocorrencias, 1) }));
  const tolerancia = Math.max(1, Math.round(escala));

  let tentativasRestantes = 20000;
  while (jogos.length < quantidade && tentativasRestantes > 0) {
    tentativasRestantes--;
    const jogo = sorteioPonderado(pesos, k, rand);
    const m = metricasJogo(jogo, cfg);
    const relaxado = tentativasRestantes < 5000; // afrouxa os filtros se estiver difícil
    const ok =
      m.soma >= alvo.somaMin &&
      m.soma <= alvo.somaMax &&
      Math.abs(m.pares - alvo.pares) <= tolerancia + (relaxado ? 1 : 0) &&
      Math.abs(m.baixas - alvo.baixas) <= tolerancia + (relaxado ? 1 : 0);
    if (ok) {
      adicionar(
        'media',
        `Média — jogo equilibrado ${jogos.filter((j) => j.estrategia === 'media').length + 1}`,
        `Sorteio ponderado pelas ocorrências, com soma entre ${Math.round(alvo.somaMin)} e ${Math.round(alvo.somaMax)} ` +
          `e pares/baixas próximos da mediana histórica.`,
        jogo,
      );
    }
  }

  return {
    semente: seed,
    alvo: { ...alvo, somaMin: Math.round(alvo.somaMin), somaMax: Math.round(alvo.somaMax) },
    probabilidades: probabilidades(cfg, k),
    jogos: jogos.map((j) => ({
      ...j,
      metricas: metricasJogo(j.dezenas, cfg),
      historico: conferirHistorico(cfg, j.dezenas, concursos),
    })),
  };
}

/** Confere um jogo contra todos os concursos informados. */
export function conferirHistorico(cfg, dezenas, concursos) {
  const conjunto = new Set(dezenas);
  const distribuicao = new Map();
  let melhor = { acertos: 0, concurso: null };
  const faixas = cfg.faixas.map((f) => ({ ...f, vezes: 0, concursos: [] }));

  for (const c of concursos) {
    const acertos = c.dezenas.reduce((n, d) => n + (conjunto.has(d) ? 1 : 0), 0);
    distribuicao.set(acertos, (distribuicao.get(acertos) ?? 0) + 1);
    if (acertos > melhor.acertos) melhor = { acertos, concurso: c.numero };
    const faixa = faixas.find((f) => f.acertos === acertos);
    if (faixa) {
      faixa.vezes++;
      if (faixa.concursos.length < 10) faixa.concursos.push(c.numero);
    }
  }
  return {
    concursosConferidos: concursos.length,
    faixas,
    melhorAcerto: melhor,
    distribuicaoAcertos: [...distribuicao.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([acertos, vezes]) => ({ acertos, vezes })),
  };
}

/** Probabilidade real (hipergeométrica) de cada faixa para uma aposta de k dezenas. */
export function probabilidades(cfg, k) {
  const n = universo(cfg).length;
  const s = cfg.qtdSorteadas;
  const total = comb(n, s);
  return cfg.faixas.map((f) => {
    const p = (comb(k, f.acertos) * comb(n - k, s - f.acertos)) / total;
    return { ...f, probabilidade: p, umEm: p > 0 ? Math.round(1 / p) : null };
  });
}

export function validarJogo(cfg, dezenas) {
  if (!Array.isArray(dezenas)) return 'Informe a lista de dezenas.';
  const unicas = [...new Set(dezenas.map(Number))];
  if (unicas.length !== dezenas.length) return 'Há dezenas repetidas.';
  if (unicas.some((d) => !Number.isInteger(d) || d < cfg.dezenaMin || d > cfg.dezenaMax)) {
    return `As dezenas devem estar entre ${cfg.dezenaMin} e ${cfg.dezenaMax}.`;
  }
  if (unicas.length < cfg.apostaMin || unicas.length > cfg.apostaMax) {
    return `Marque de ${cfg.apostaMin} a ${cfg.apostaMax} dezenas.`;
  }
  return null;
}

// ---------------------------------------------------------------------------

function maisProximaLivre(valor, usadas, cfg) {
  for (let delta = 0; delta <= cfg.dezenaMax; delta++) {
    for (const cand of [valor + delta, valor - delta]) {
      if (cand >= cfg.dezenaMin && cand <= cfg.dezenaMax && !usadas.has(cand)) return cand;
    }
  }
  return valor;
}

function sorteioPonderado(pesos, k, rand) {
  const restantes = [...pesos];
  const escolhidas = [];
  while (escolhidas.length < k && restantes.length) {
    const total = restantes.reduce((a, p) => a + p.peso, 0);
    let r = rand() * total;
    let i = 0;
    while (r > restantes[i].peso && i < restantes.length - 1) r -= restantes[i++].peso;
    escolhidas.push(restantes[i].dezena);
    restantes.splice(i, 1);
  }
  return escolhidas;
}

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - Math.min(k, n - k) + i)) / i;
  return r;
}

/** Gerador pseudoaleatório com semente (permite reproduzir uma sugestão). */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
