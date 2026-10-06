import { getDb } from '../db/index.js';

export async function getModalidadeId(codigo) {
  const db = await getDb();
  const [row] = await db.query('SELECT id FROM modalidade WHERE codigo = ?', [codigo]);
  if (!row) {
    throw new Error(`Modalidade "${codigo}" não cadastrada. Execute "npm run db:init".`);
  }
  return row.id;
}

export async function numerosExistentes(modalidadeId) {
  const db = await getDb();
  const rows = await db.query('SELECT numero FROM concurso WHERE modalidade_id = ?', [modalidadeId]);
  return new Set(rows.map((r) => r.numero));
}

/** Grava um concurso completo (cabeçalho, dezenas e premiação) em uma transação. */
export async function salvarConcurso(modalidadeId, c) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.query(
      `INSERT INTO concurso (modalidade_id, numero, data_apuracao, acumulado, valor_arrecadado, valor_estimado_proximo)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (modalidade_id, numero) DO NOTHING
       RETURNING id`,
      [modalidadeId, c.numero, c.data, c.acumulado, c.valorArrecadado, c.valorEstimadoProximo],
    );
    if (!row) return false; // já existia

    for (const d of c.dezenas) {
      await tx.query('INSERT INTO concurso_dezena (concurso_id, dezena, ordem_sorteio) VALUES (?, ?, ?)', [
        row.id,
        d.dezena,
        d.ordem,
      ]);
    }
    for (const p of c.premiacao) {
      await tx.query(
        'INSERT INTO concurso_premiacao (concurso_id, faixa, descricao, ganhadores, valor_premio) VALUES (?, ?, ?, ?, ?)',
        [row.id, p.faixa, p.descricao, p.ganhadores, p.valorPremio],
      );
    }
    return true;
  });
}

export async function ultimaData(codigo) {
  const db = await getDb();
  const [row] = await db.query(
    `SELECT MAX(c.data_apuracao) AS data
       FROM concurso c JOIN modalidade m ON m.id = c.modalidade_id
      WHERE m.codigo = ?`,
    [codigo],
  );
  return row?.data ?? null;
}

/**
 * Concursos a partir de uma data, em ordem crescente, com as dezenas ordenadas.
 * @returns {Promise<Array<{numero:number,data:string,acumulado:boolean,dezenas:number[]}>>}
 */
export async function carregarConcursos(codigo, desdeData) {
  const db = await getDb();
  const rows = await db.query(
    `SELECT c.numero, c.data_apuracao AS data, c.acumulado, d.dezena
       FROM concurso c
       JOIN modalidade m      ON m.id = c.modalidade_id
       JOIN concurso_dezena d ON d.concurso_id = c.id
      WHERE m.codigo = ? AND c.data_apuracao >= ?
      ORDER BY c.numero, d.dezena`,
    [codigo, desdeData],
  );
  const porNumero = new Map();
  for (const r of rows) {
    let c = porNumero.get(r.numero);
    if (!c) {
      c = { numero: r.numero, data: r.data, acumulado: Boolean(r.acumulado), dezenas: [] };
      porNumero.set(r.numero, c);
    }
    c.dezenas.push(Number(r.dezena));
  }
  return [...porNumero.values()];
}

/** Ganhadores e prêmios por faixa dos concursos informados. */
export async function premiacaoDosConcursos(codigo, numeros) {
  if (!numeros.length) return new Map();
  const db = await getDb();
  const rows = await db.query(
    `SELECT c.numero, p.faixa, p.descricao, p.ganhadores, p.valor_premio
       FROM concurso_premiacao p
       JOIN concurso   c ON c.id = p.concurso_id
       JOIN modalidade m ON m.id = c.modalidade_id
      WHERE m.codigo = ? AND c.numero IN (${numeros.map(() => '?').join(',')})
      ORDER BY c.numero, p.faixa`,
    [codigo, ...numeros],
  );
  const mapa = new Map();
  for (const r of rows) {
    if (!mapa.has(r.numero)) mapa.set(r.numero, []);
    mapa.get(r.numero).push({
      faixa: r.faixa,
      descricao: r.descricao,
      ganhadores: Number(r.ganhadores),
      valorPremio: Number(r.valor_premio),
    });
  }
  return mapa;
}
