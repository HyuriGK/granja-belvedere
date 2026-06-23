require('dotenv').config({ path: '.env.local' });
const path = require('path');
const express = require('express');
const { readAll, replaceAll } = require('../lib/data-store');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', async (req, res) => {
  try {
    await readAll();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    res.json(await readAll());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao carregar os dados.' });
  }
});

app.put('/api/data', async (req, res) => {
  try {
    res.json(await replaceAll(req.body || {}));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar os dados.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Granja Belvedere: http://localhost:${port}`));
}

module.exports = app;
