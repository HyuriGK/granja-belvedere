const fs = require('fs');
const { replaceAll } = require('../lib/data-store');
const pool = require('../lib/db');

const source = process.argv[2];
if (!source) {
  throw new Error('Informe o caminho do backup: npm run db:import -- C:\\caminho\\backup.json');
}
const raw = JSON.parse(fs.readFileSync(source, 'utf8'));
const data = {
  clientes: raw.clientes || [],
  transacoes: raw.transacoes || [],
  lotes: raw.lotes || [],
  oportunidades: raw.oportunidades || [],
  tarefas: raw.tarefas || []
};

replaceAll(data)
  .then(result => {
    console.log(`Importados: ${result.clientes.length} clientes, ${result.transacoes.length} transações, ${result.lotes.length} lotes.`);
  })
  .finally(() => pool.end());
