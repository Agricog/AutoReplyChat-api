import express from 'express';
import { query } from '../db/database.js';

const router = express.Router();

// GET /api/dash/customer — profile + trial info
router.get('/customer', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, trial_ends_at, subscription_status, stripe_customer_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const c = result.rows[0];
    const status = c.subscription_status || 'trial';
    const trialEnd = c.trial_ends_at ? new Date(c.trial_ends_at) : null;
    const daysLeft = trialEnd ? Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)) : null;
    const hasAccess = status === 'active' || (status === 'trial' && trialEnd && trialEnd > new Date());
    res.json({
      id: c.id, name: c.name, email: c.email,
      subscriptionStatus: status,
      trialEndsAt: c.trial_ends_at,
      daysLeft,
      hasAccess,
      isPaid: status === 'active',
      showTrialBanner: status === 'trial' && daysLeft !== null && daysLeft <= 7,
      hasStripe: !!c.stripe_customer_id
    });
  } catch (error) {
    console.error('Dashboard API customer error:', error);
    res.status(500).json({ error: 'Failed to load customer' });
  }
});

// GET /api/dash/bots — list all bots for user
router.get('/bots', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, public_id, name, bot_instructions, greeting_message, header_title, header_color, text_color,
              lead_capture_enabled, notification_emails, conversation_notifications, chat_bubble_bg, avatar_bg,
              button_style, button_position, button_size, bar_message, chat_window_bg, user_message_bg,
              bot_message_bg, send_button_bg, lead_form_message, greeting_bubble_enabled, created_at
       FROM bots WHERE customer_id = $1 ORDER BY created_at ASC`,
      [req.customerId]
    );
    let bots = result.rows;
    // Auto-create first bot if none exist
    if (bots.length === 0) {
      const crypto = await import('crypto');
      const publicId = crypto.default.randomBytes(12).toString('hex');
      const newBot = await query(
        `INSERT INTO bots (customer_id, name, public_id, bot_instructions)
         VALUES ($1, 'My First Bot', $2, 'You are a helpful assistant.')
         RETURNING *`,
        [req.customerId, publicId]
      );
      bots = newBot.rows;
    }
    res.json({ bots });
  } catch (error) {
    console.error('Dashboard API bots error:', error);
    res.status(500).json({ error: 'Failed to load bots' });
  }
});

// GET /api/dash/bot/:botId/stats — counts
router.get('/bot/:botId/stats', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    // Verify bot belongs to user
    const botCheck = await query('SELECT id FROM bots WHERE id = $1 AND customer_id = $2', [botId, req.customerId]);
    if (botCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const botCount = await query('SELECT COUNT(*) as count FROM bots WHERE customer_id = $1', [req.customerId]);
    const docCount = await query('SELECT COUNT(*) as count FROM documents WHERE bot_id = $1', [botId]);
    const leadCount = await query('SELECT COUNT(*) as count FROM leads WHERE bot_id = $1', [botId]);
    const msgCount = await query('SELECT COUNT(*) as count FROM messages WHERE bot_id = $1', [botId]);

    res.json({
      documents: parseInt(docCount.rows[0].count),
      leads: parseInt(leadCount.rows[0].count),
      messages: parseInt(msgCount.rows[0].count),
      bots: parseInt(botCount.rows[0].count)
    });
  } catch (error) {
    console.error('Dashboard API stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/dash/bot/:botId/documents — document list (excludes Q&A)
router.get('/bot/:botId/documents', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const botCheck = await query('SELECT id FROM bots WHERE id = $1 AND customer_id = $2', [botId, req.customerId]);
    if (botCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const result = await query(
      `SELECT id, title, content_type, source_url, LENGTH(content) as char_count, created_at
       FROM documents
       WHERE bot_id = $1 AND (title NOT LIKE 'Q&A:%' OR title IS NULL)
       ORDER BY created_at DESC`,
      [botId]
    );
    res.json({ documents: result.rows });
  } catch (error) {
    console.error('Dashboard API documents error:', error);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// GET /api/dash/bot/:botId/qa — Q&A pairs
router.get('/bot/:botId/qa', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const botCheck = await query('SELECT id FROM bots WHERE id = $1 AND customer_id = $2', [botId, req.customerId]);
    if (botCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const result = await query(
      `SELECT id, title, content, created_at
       FROM documents
       WHERE bot_id = $1 AND title LIKE 'Q&A:%'
       ORDER BY created_at DESC`,
      [botId]
    );
    res.json({ qaPairs: result.rows });
  } catch (error) {
    console.error('Dashboard API QA error:', error);
    res.status(500).json({ error: 'Failed to load Q&A pairs' });
  }
});

// GET /api/dash/bot/:botId/leads
router.get('/bot/:botId/leads', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const botCheck = await query('SELECT id FROM bots WHERE id = $1 AND customer_id = $2', [botId, req.customerId]);
    if (botCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const result = await query(
      'SELECT id, name, email, created_at FROM leads WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 100',
      [botId]
    );
    res.json({ leads: result.rows });
  } catch (error) {
    console.error('Dashboard API leads error:', error);
    res.status(500).json({ error: 'Failed to load leads' });
  }
});

// GET /api/dash/bot/:botId/messages
router.get('/bot/:botId/messages', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const botCheck = await query('SELECT id FROM bots WHERE id = $1 AND customer_id = $2', [botId, req.customerId]);
    if (botCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const result = await query(
      `SELECT m.id, m.role, m.content, m.created_at, l.name as lead_name, l.email as lead_email
       FROM messages m
       LEFT JOIN leads l ON m.lead_id = l.id
       WHERE m.bot_id = $1
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [botId]
    );
    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Dashboard API messages error:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

export default router;
