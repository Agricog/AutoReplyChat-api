import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';

// Import routes
import chatRoutes from './routes/chat.js';
import contentRoutes from './routes/content.js';
import customersRoutes from './routes/customers.js';
import dashboardRoutes from './routes/dashboard.js';
import documentRoutes from './routes/documents.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import loginRoute from './routes/login.js';
import signupRoute from './routes/signup.js';
import botRoutes from './routes/bots.js';
import { startConversationNotifier } from './services/conversationNotifier.js';

// Import middleware
import { requireAuth } from './middleware/auth.js';

// Import migrations
import { runMigrations } from './db/migrate.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's proxy
app.set('trust proxy', 1);

// PostgreSQL session store
const PgSession = connectPgSimple(session);
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

// Run database migrations on startup
await runMigrations();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'https://autoreplychat.com'],
  credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  store: new PgSession({
    pool: pgPool,
    tableName: 'sessions',
    createTableIfMissing: false
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 15 * 60 * 1000,
    sameSite: 'lax'
  },
  name: 'sessionId'
}));

// Session timeout - extend on activity
app.use((req, res, next) => {
  if (req.session && req.session.customerId) {
    req.session.touch();
  }
  next();
});

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Auth routes (no auth required)
app.use('/api/auth', authRoutes);

// Public bot settings endpoint (for widget)
app.get('/api/bots/:botId/settings', async (req, res) => {
  try {
    const { query } = await import('./db/database.js');
    const botId = parseInt(req.params.botId);
    
    const result = await query(
      `SELECT id, name, greeting_message, header_title, header_color, text_color, lead_capture_enabled 
       FROM bots WHERE id = $1`,
      [botId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    const bot = result.rows[0];
    res.json({
      botId: bot.id,
      name: bot.name,
      greetingMessage: bot.greeting_message || 'Thank you for visiting! How may we assist you today?',
      headerTitle: bot.header_title || 'Support Assistant',
      headerColor: bot.header_color || '#3b82f6',
      textColor: bot.text_color || '#ffffff',
      leadCaptureEnabled: bot.lead_capture_enabled !== false
    });
  } catch (error) {
    console.error('Get bot settings error:', error);
    res.status(500).json({ error: 'Failed to get bot settings' });
  }
});

// Protected bot routes
app.use('/api/bots', requireAuth, botRoutes);

// Login and signup pages (no auth required)
app.use('/login', loginRoute);
app.use('/signup', signupRoute);

// Public chat endpoint (no auth required - used by widget)
app.use('/api/chat', chatRoutes);

// Protected routes - require authentication
app.use('/api/content', requireAuth, contentRoutes);
app.use('/api/customers', requireAuth, customersRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/documents', documentRoutes);

// Admin routes (no auth for now)
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Auto Reply Chat API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 Session store: PostgreSQL`);
});
// Start conversation notifier
startConversationNotifier();
