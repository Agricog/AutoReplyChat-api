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
import stripeRoutes from './routes/stripe.js';
import { startConversationNotifier } from './services/conversationNotifier.js';
import { startRetrainScheduler } from './services/retrainScheduler.js';
import dashboardApiRoutes from './routes/dashboard-api.js';

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

// ─── STRIPE WEBHOOK (must be before express.json() - needs raw body) ───
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Dynamically import Stripe to use env vars
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { query } = await import('./db/database.js');

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = parseInt(session.metadata.customerId);
        if (customerId) {
          await query(
            `UPDATE customers 
             SET subscription_status = 'active',
                 stripe_customer_id = $1,
                 stripe_subscription_id = $2
             WHERE id = $3`,
            [session.customer, session.subscription, customerId]
          );
          console.log(`[Stripe] Customer ${customerId} activated via checkout`);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const result = await query(
          'SELECT id FROM customers WHERE stripe_customer_id = $1',
          [invoice.customer]
        );
        if (result.rows.length > 0) {
          await query(
            "UPDATE customers SET subscription_status = 'active' WHERE stripe_customer_id = $1",
            [invoice.customer]
          );
          console.log(`[Stripe] Invoice paid for customer ${result.rows[0].id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        console.warn(`[Stripe] Payment failed for ${event.data.object.customer}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await query(
          "UPDATE customers SET subscription_status = 'cancelled', stripe_subscription_id = NULL WHERE stripe_customer_id = $1",
          [subscription.customer]
        );
        console.log(`[Stripe] Subscription cancelled for ${subscription.customer}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        if (subscription.status === 'active') {
          await query(
            "UPDATE customers SET subscription_status = 'active' WHERE stripe_customer_id = $1",
            [subscription.customer]
          );
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Body parsing (after webhook route)
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
app.get('/api/bots/:publicId/settings', async (req, res) => {
  try {
    const { query } = await import('./db/database.js');
    const publicId = req.params.publicId;
    
    const result = await query(
      `SELECT id, public_id, name, greeting_message, header_title, header_color, text_color, lead_capture_enabled,
              chat_bubble_bg, avatar_bg, button_style, button_position, button_size, bar_message,
              chat_window_bg, user_message_bg, bot_message_bg, send_button_bg, lead_form_message
       FROM bots WHERE public_id = $1`,
      [publicId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    const bot = result.rows[0];
    res.json({
      botId: bot.public_id,
      name: bot.name,
      greetingMessage: bot.greeting_message || 'Thank you for visiting! How may we assist you today?',
      headerTitle: bot.header_title || 'Support Assistant',
      headerColor: bot.header_color || '#3b82f6',
      textColor: bot.text_color || '#ffffff',
      leadCaptureEnabled: bot.lead_capture_enabled !== false,
      chatBubbleBg: bot.chat_bubble_bg || '#3b82f6',
      avatarBg: bot.avatar_bg || '#e0e0e0',
      buttonStyle: bot.button_style || 'circle',
      buttonPosition: bot.button_position || 'right',
      buttonSize: bot.button_size || 60,
      barMessage: bot.bar_message || 'Chat Now',
      chatWindowBg: bot.chat_window_bg || '#ffffff',
      userMessageBg: bot.user_message_bg || '#3b82f6',
      botMessageBg: bot.bot_message_bg || '#f3f4f6',
      sendButtonBg: bot.send_button_bg || '#3b82f6',
      leadFormMessage: bot.lead_form_message || "Want personalized help? Leave your details and we'll follow up"
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

// Stripe routes (checkout & portal need auth, webhook handled above)
app.use('/api/stripe', requireAuth, stripeRoutes);

// Protected routes - require authentication
app.use('/api/content', requireAuth, contentRoutes);
app.use('/api/customers', requireAuth, customersRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dash', requireAuth, dashboardApiRoutes);

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

startRetrainScheduler();

// Start conversation notifier
startConversationNotifier();
