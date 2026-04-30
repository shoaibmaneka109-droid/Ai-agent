const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes         = require('./routes/auth.routes');
const tenantRoutes       = require('./routes/tenant.routes');
const userRoutes         = require('./routes/user.routes');
const paymentRoutes      = require('./routes/payment.routes');
const apiKeyRoutes       = require('./routes/apiKey.routes');
const webhookRoutes      = require('./routes/webhook.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const autofillRoutes     = require('./routes/autofill.routes');

const errorHandler = require('./middleware/error.middleware');
const notFound     = require('./middleware/notFound.middleware');
const logger       = require('./utils/logger');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  exposedHeaders: ['X-Access-Status', 'X-Access-Reason', 'X-In-Grace-Period', 'X-Data-Read-Only'],
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
});

// ── Body parsing & compression ────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'SecurePay', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',         authLimiter, authRoutes);
app.use('/api/v1/subscription', subscriptionRoutes);
app.use('/api/v1/tenants',      tenantRoutes);
app.use('/api/v1/users',        userRoutes);
app.use('/api/v1/payments',     paymentRoutes);
app.use('/api/v1/api-keys',     apiKeyRoutes);
app.use('/api/v1/autofill',     autofillRoutes);
app.use('/api/v1/webhooks',     webhookRoutes);

// ── 404 & global error handling ───────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
