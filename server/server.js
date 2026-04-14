require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { assertSupabaseConfig } = require('./lib/supabase');

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_DIST_PATH = path.join(__dirname, '..', 'client', 'dist');
const CLIENT_INDEX_PATH = path.join(CLIENT_DIST_PATH, 'index.html');
const hasClientBuild = fs.existsSync(CLIENT_INDEX_PATH);
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

assertSupabaseConfig();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin nao permitida pelo CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/notebooks', require('./routes/notebooks'));
app.use('/api/sections', require('./routes/sections'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/stats', require('./routes/stats'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: 'supabase',
    timestamp: new Date().toISOString(),
  });
});

app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(204).end();
});

if (hasClientBuild) {
  app.use(express.static(CLIENT_DIST_PATH, { index: false }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(CLIENT_INDEX_PATH);
  });
} else {
  app.get('/', (req, res) => {
    res.status(503).send('Frontend nao encontrado. Rode o build do client ou use http://localhost:5173 em modo dev.');
  });
}

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log('Supabase configuration loaded');
  console.log(hasClientBuild ? `Frontend servido de ${CLIENT_DIST_PATH}` : 'Frontend build ausente');
});
