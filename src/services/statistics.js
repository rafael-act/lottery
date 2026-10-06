/**
 * Estatística descritiva sobre os concursos: ocorrências e incidência de cada
 * dezena e média / mediana / moda das características de cada sorteio.
 */

export const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

export function mediana(v) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/** Moda: pode haver mais de um valor com a maior frequência. */
export function moda(v) {
  const cont = new Map();
  for (const x of v) cont.set(x, (cont.get(x) ?? 0) + 1);
  const max = Math.max(0, ...cont.values());
  return [...cont.entries()]
    .filter(([, n]) => n === max)
    .map(([x]) => x)
    .sort((a, b) => a - b);
}

export function desvioPadrao(v) {
  if (v.length < 2) return 0;
  const m = media(v);
  return Math.sqrt(v.reduce((acc, x) => acc + (x - m) ** 2, 0) / (v.length - 1));
}

const arred = (x, casas = 2) => Math.round(x * 10 ** casas) / 10 ** casas;

export function resumo(v) {
  return {
    media: arred(media(v)),
    mediana: arred(mediana(v)),
    moda: moda(v),
    desvioPadrao: arred(desvioPadrao(v)),
    minimo: v.length ? Math.min(...v) : 0,
    maximo: v.length ? Math.max(...v) : 0,
  };
}

/** Quantas vezes cada valor aparece (para histogramas). */
function distribuicao(v) {
  const cont = new Map();
  for (const x of v) cont.set(x, (cont.get(x) ?? 0) + 1);
  return [...cont.entries()].sort((a, b) => a[0] - b[0]).map(([valor, vezes]) => ({ valor, vezes }));
}

const PRIMOS = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79]);

/** Métricas de um conjunto de dezenas, usadas tanto nos sorteios quanto nos jogos sugeridos. */
export function metricasJogo(dezenas, cfg) {
  const metade = Math.floor((cfg.dezenaMin + cfg.dezenaMax) / 2);
  return {
    soma: dezenas.reduce((a, b) => a + b, 0),
    pares: dezenas.filter((d) => d % 2 === 0).length,
    baixas: dezenas.filter((d) => d <= metade).length,
    primos: dezenas.filter((d) => PRIMOS.has(d)).length,
  };
}

export function universo(cfg) {
  return Array.from({ length: cfg.dezenaMax - cfg.dezenaMin + 1 }, (_, i) => cfg.dezenaMin + i);
}

/**
 * @param {object} cfg       regras da modalidade (config/modalidades.json)
 * @param {Array}  concursos concursos em ordem crescente, com dezenas ordenadas
 */
export function calcularEstatisticas(cfg, concursos) {
  const total = concursos.length;
  const dezenasUniverso = universo(cfg);
  const esperado = (total * cfg.qtdSorteadas) / dezenasUniverso.length;

  // ---- Ocorrências por dezena ---------------------------------------------
  const porDezena = new Map(dezenasUniverso.map((d) => [d, { ocorrencias: 0, ultimoIndice: -1, maiorAtraso: 0 }]));
  concursos.forEach((c, i) => {
    for (const d of c.dezenas) {
      const reg = porDezena.get(d);
      if (!reg) continue;
      reg.maiorAtraso = Math.max(reg.maiorAtraso, i - reg.ultimoIndice - 1);
      reg.ocorrencias++;
      reg.ultimoIndice = i;
    }
  });

  const ocorrenciasLista = dezenasUniverso.map((d) => porDezena.get(d).ocorrencias);
  const q1 = quantil(ocorrenciasLista, 0.25);
  const q3 = quantil(ocorrenciasLista, 0.75);

  const dezenas = dezenasUniverso.map((d) => {
    const reg = porDezena.get(d);
    const atraso = reg.ultimoIndice < 0 ? total : total - 1 - reg.ultimoIndice;
    return {
      dezena: d,
      ocorrencias: reg.ocorrencias,
      incidencia: total ? arred((reg.ocorrencias / total) * 100) : 0,
      desvioEsperado: esperado ? arred(((reg.ocorrencias - esperado) / esperado) * 100, 1) : 0,
      atraso,
      maiorAtraso: Math.max(reg.maiorAtraso, atraso),
      ultimoConcurso: reg.ultimoIndice >= 0 ? concursos[reg.ultimoIndice].numero : null,
      classificacao: reg.ocorrencias >= q3 ? 'quente' : reg.ocorrencias <= q1 ? 'fria' : 'neutra',
    };
  });

  // Agrupa dezenas pela quantidade de ocorrências (quantas dezenas saíram N vezes).
  const incidenciasPorOcorrencia = distribuicao(ocorrenciasLista).map(({ valor, vezes }) => ({
    ocorrencias: valor,
    qtdDezenas: vezes,
    dezenas: dezenas.filter((d) => d.ocorrencias === valor).map((d) => d.dezena),
  }));

  // ---- Características de cada sorteio ------------------------------------
  const metricas = concursos.map((c) => metricasJogo(c.dezenas, cfg));
  const repetidas = concursos.slice(1).map((c, i) => {
    const anterior = new Set(concursos[i].dezenas);
    return c.dezenas.filter((d) => anterior.has(d)).length;
  });

  const caracteristica = (titulo, valores, descricao) => ({
    titulo,
    descricao,
    ...resumo(valores),
    distribuicao: distribuicao(valores),
  });

  const padroes = {
    soma: caracteristica('Soma das dezenas', metricas.map((m) => m.soma), 'Soma de todas as dezenas sorteadas'),
    pares: caracteristica('Dezenas pares', metricas.map((m) => m.pares), 'Quantidade de dezenas pares por sorteio'),
    baixas: caracteristica(
      'Dezenas baixas',
      metricas.map((m) => m.baixas),
      `Dezenas até ${Math.floor((cfg.dezenaMin + cfg.dezenaMax) / 2)} por sorteio`,
    ),
    primos: caracteristica('Dezenas primas', metricas.map((m) => m.primos), 'Quantidade de números primos por sorteio'),
    repetidas: caracteristica(
      'Repetidas do anterior',
      repetidas,
      'Dezenas que repetiram do concurso anterior',
    ),
  };

  // ---- Estatística posicional (dezenas ordenadas) -------------------------
  const posicional = Array.from({ length: cfg.qtdSorteadas }, (_, p) => {
    const valores = concursos.map((c) => c.dezenas[p]).filter((x) => x !== undefined);
    return { posicao: p + 1, ...resumo(valores) };
  });

  return {
    modalidade: cfg.codigo,
    totalConcursos: total,
    primeiroConcurso: concursos[0] ?? null,
    ultimoConcurso: concursos.at(-1) ?? null,
    volumeOcorrencias: total * cfg.qtdSorteadas,
    ocorrenciaEsperada: arred(esperado),
    resumoOcorrencias: resumo(ocorrenciasLista),
    dezenas,
    incidenciasPorOcorrencia,
    padroes,
    posicional,
  };
}

function quantil(v, q) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  return s[base + 1] !== undefined ? s[base] + (pos - base) * (s[base + 1] - s[base]) : s[base];
}
