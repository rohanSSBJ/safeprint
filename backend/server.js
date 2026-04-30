const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env.local') });
require('dotenv').config();
const fileRoutes = require('./routes/fileRoutes');
const shopRoutes = require('./routes/shopRoutes');
const { cleanupExpiredJobs } = require('./lib/printJobCleanup');

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"],
  exposedHeaders: ["Content-Disposition"]
}));
app.use(express.json());

app.get('/', async (req, res) => {
  try {
    const cleanup = await cleanupExpiredJobs();
    res.json({ ok: true, service: 'safeprint-backend', cleanup });
  } catch (err) {
    console.error('Health cleanup failed:', err);
    res.json({ ok: true, service: 'safeprint-backend', cleanup: null });
  }
});

app.use('/api/files', fileRoutes);
app.use('/api/shops', shopRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
