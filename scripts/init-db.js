const ensureSchema = require('../lib/schema');
const pool = require('../lib/db');

ensureSchema()
  .then(() => console.log('Tabelas da Granja Belvedere criadas.'))
  .finally(() => pool.end());
