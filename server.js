const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', require('./routes/api'));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    app: 'Build360 Field Manager API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n══════════════════════════════════════════');
  console.log('  🏗️  Build360 Field Manager API');
  console.log(`  🚀 Server running on port ${PORT}`);
  console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  📡 Base URL: http://localhost:${PORT}/api`);
  console.log('══════════════════════════════════════════\n');
});

module.exports = app;
