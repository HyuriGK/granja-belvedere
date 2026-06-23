const pool = require('./db');
const ensureSchema = require('./schema');

const number = value => Number(value || 0);
const id = value => value === null || value === undefined || value === '' ? null : Number(value);

async function readAll(client = pool) {
  await ensureSchema();
  const clientes = await client.query('SELECT * FROM clientes ORDER BY nome');
  const transacoes = await client.query('SELECT * FROM transacoes ORDER BY data DESC, id DESC');
  const lotes = await client.query('SELECT * FROM lotes ORDER BY data DESC, id DESC');
  const oportunidades = await client.query('SELECT * FROM oportunidades ORDER BY id');
  const tarefas = await client.query('SELECT * FROM tarefas ORDER BY data, hora NULLS LAST, id');
  return {
    clientes: clientes.rows.map(row => ({
      id: number(row.id), nome: row.nome, contato: row.contato, email: row.email,
      cidade: row.cidade, segmento: row.segmento, observacoes: row.observacoes
    })),
    transacoes: transacoes.rows.map(row => ({
      id: number(row.id), tipo: row.tipo, data: row.data.toISOString().slice(0, 10),
      clienteId: id(row.cliente_id), qtd: number(row.qtd), valor: number(row.valor),
      produto: row.produto, desc: row.descricao, responsavel: row.responsavel,
      fornecedor: row.fornecedor, formaPagamento: row.forma_pagamento,
      pago: row.pago, cortesia: row.cortesia, comissao: row.comissao
    })),
    lotes: lotes.rows.map(row => ({
      id: number(row.id), nome: row.nome, qtd: number(row.qtd),
      data: row.data.toISOString().slice(0, 10), status: row.status
    })),
    oportunidades: oportunidades.rows.map(row => ({
      id: number(row.id), clienteId: id(row.cliente_id), titulo: row.titulo,
      valor: number(row.valor), etapa: row.etapa,
      previsao: row.previsao ? row.previsao.toISOString().slice(0, 10) : '',
      observacoes: row.observacoes
    })),
    tarefas: tarefas.rows.map(row => ({
      id: number(row.id), titulo: row.titulo, clienteId: id(row.cliente_id),
      data: row.data.toISOString().slice(0, 10),
      hora: row.hora ? String(row.hora).slice(0, 5) : '',
      tipo: row.tipo, concluida: row.concluida
    }))
  };
}

async function replaceAll(data) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM tarefas');
    await client.query('DELETE FROM oportunidades');
    await client.query('DELETE FROM transacoes');
    await client.query('DELETE FROM lotes');
    await client.query('DELETE FROM clientes');

    for (const item of data.clientes || []) {
      await client.query(`
        INSERT INTO clientes (id, nome, contato, email, cidade, segmento, observacoes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [id(item.id), item.nome, item.contato || '', item.email || '', item.cidade || '', item.segmento || 'Residencial', item.observacoes || '']);
    }
    for (const item of data.transacoes || []) {
      await client.query(`
        INSERT INTO transacoes
          (id,tipo,data,cliente_id,qtd,valor,produto,descricao,responsavel,fornecedor,forma_pagamento,pago,cortesia,comissao)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [id(item.id), item.tipo, item.data, id(item.clienteId), number(item.qtd), number(item.valor),
        item.produto || item.desc || '', item.desc || item.produto || '', item.responsavel || '',
        item.fornecedor || '', item.formaPagamento || '', !!item.pago, !!item.cortesia, !!item.comissao]);
    }
    for (const item of data.lotes || []) {
      await client.query(
        'INSERT INTO lotes (id,nome,qtd,data,status) VALUES ($1,$2,$3,$4,$5)',
        [id(item.id), item.nome, number(item.qtd), item.data, item.status || 'Ativo']
      );
    }
    for (const item of data.oportunidades || []) {
      await client.query(`
        INSERT INTO oportunidades (id,cliente_id,titulo,valor,etapa,previsao,observacoes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [id(item.id), id(item.clienteId), item.titulo, number(item.valor), item.etapa || 'lead', item.previsao || null, item.observacoes || '']);
    }
    for (const item of data.tarefas || []) {
      await client.query(`
        INSERT INTO tarefas (id,titulo,cliente_id,data,hora,tipo,concluida)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [id(item.id), item.titulo, id(item.clienteId), item.data, item.hora || null, item.tipo || '', !!item.concluida]);
    }
    await client.query('COMMIT');
    return readAll(client);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { readAll, replaceAll };
