import express from 'express';
import crypto from 'crypto';
import { query } from '../db/database.js';

const router = express.Router();

// Generate random public ID
function generatePublicId() {
  return crypto.randomBytes(12).toString('hex');
}

// POST /api/bots - Create a new bot
router.post('/', async (req, res) => {
  try {
    const { customerId, name } = req.body;

    if (!customerId || !name) {
      return res.status(400).json({ error: 'customerId and name are required' });
    }

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const publicId = generatePublicId();

    const result = await query(
      `INSERT INTO bots (customer_id, name, public_id, bot_instructions) 
       VALUES ($1, $2, $3, 'You are a helpful assistant.')
       RETURNING id, public_id`,
      [customerId, name, publicId]
    );

    res.json({ success: true, botId: result.rows[0].id, publicId: result.rows[0].public_id });
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'Failed to create bot' });
  }
});

// GET /api/bots/:botId/settings - Get bot settings (public, no auth needed for widget)
router.get('/:botId/settings', async (req, res) => {
  try {
    const botIdParam = req.params.botId;

    // Support both numeric ID and public_id
    const isNumeric = /^\d+$/.test(botIdParam);
    const result = await query(
      `SELECT b.id, b.customer_id, b.public_id, b.name, b.greeting_message, b.header_title, b.header_color, b.text_color, b.lead_capture_enabled,
              b.chat_bubble_bg, b.avatar_bg, b.button_style, b.button_position, b.button_size, b.bar_message,
              b.chat_window_bg, b.user_message_bg, b.bot_message_bg, b.send_button_bg, b.lead_form_message,
              b.greeting_bubble_enabled, c.subscription_status
       FROM bots b
       JOIN customers c ON c.id = b.customer_id
       WHERE ${isNumeric ? 'b.id = $1' : 'b.public_id = $1'}`,
      [isNumeric ? parseInt(botIdParam) : botIdParam]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const bot = result.rows[0];
    const isTrial = bot.subscription_status === 'trial';

    res.json({
      botId: bot.public_id || bot.id,
      customerId: bot.customer_id,
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
      leadFormMessage: bot.lead_form_message || 'Want personalized help? Leave your details and we\'ll follow up',
      greetingBubbleEnabled: bot.greeting_bubble_enabled !== false,
      isTrial
    });
  } catch (error) {
    console.error('Get bot settings error:', error);
    res.status(500).json({ error: 'Failed to get bot settings' });
  }
});

// DELETE /api/bots/:botId - Delete a bot
router.delete('/:botId', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const countResult = await query(
      'SELECT COUNT(*) as count FROM bots WHERE customer_id = $1',
      [customerId]
    );

    if (parseInt(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete your only bot' });
    }

    await query('DELETE FROM messages WHERE bot_id = $1', [botId]);
    await query('DELETE FROM leads WHERE bot_id = $1', [botId]);
    await query('DELETE FROM embeddings WHERE bot_id = $1', [botId]);
    await query('DELETE FROM documents WHERE bot_id = $1', [botId]);
    await query('DELETE FROM bots WHERE id = $1', [botId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'Failed to delete bot' });
  }
});

// POST /api/bots/:botId/instructions - Update bot instructions
router.post('/:botId/instructions', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, instructions } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    await query(
      'UPDATE bots SET bot_instructions = $1 WHERE id = $2',
      [instructions, botId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update instructions error:', error);
    res.status(500).json({ error: 'Failed to update instructions' });
  }
});

// POST /api/bots/:botId/greeting - Update greeting message
router.post('/:botId/greeting', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, greeting } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    await query(
      'UPDATE bots SET greeting_message = $1 WHERE id = $2',
      [greeting, botId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update greeting error:', error);
    res.status(500).json({ error: 'Failed to update greeting' });
  }
});

// POST /api/bots/:botId/greeting-bubble - Toggle greeting bubble
router.post('/:botId/greeting-bubble', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, enabled } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    await query(
      'UPDATE bots SET greeting_bubble_enabled = $1 WHERE id = $2',
      [enabled, botId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update greeting bubble error:', error);
    res.status(500).json({ error: 'Failed to update greeting bubble setting' });
  }
});

// POST /api/bots/:botId/appearance - Update appearance settings
router.post('/:botId/appearance', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const {
      customerId, headerTitle, headerColor, textColor,
      chatBubbleBg, avatarBg, buttonStyle, buttonPosition, buttonSize, barMessage,
      chatWindowBg, userMessageBg, botMessageBg, sendButtonBg
    } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    await query(
      `UPDATE bots SET 
        header_title = $1, header_color = $2, text_color = $3,
        chat_bubble_bg = $4, avatar_bg = $5, button_style = $6, button_position = $7, 
        button_size = $8, bar_message = $9, chat_window_bg = $10, user_message_bg = $11, 
        bot_message_bg = $12, send_button_bg = $13
       WHERE id = $14`,
      [headerTitle, headerColor, textColor, chatBubbleBg, avatarBg, buttonStyle,
       buttonPosition, buttonSize, barMessage, chatWindowBg, userMessageBg,
       botMessageBg, sendButtonBg, botId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update appearance error:', error);
    res.status(500).json({ error: 'Failed to update appearance' });
  }
});

// POST /api/bots/:botId/lead-capture - Toggle lead capture
router.post('/:botId/lead-capture', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, enabled } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    await query(
      'UPDATE bots SET lead_capture_enabled = $1 WHERE id = $2',
      [enabled, botId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update lead capture error:', error);
    res.status(500).json({ error: 'Failed to update lead capture setting' });
  }
});

// POST /api/bots/:botId/lead-form-message - Update lead form message
router.post('/:botId/lead-form-message', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, message } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    await query(
      'UPDATE bots SET lead_form_message = $1 WHERE id = $2',
      [message, botId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update lead form message error:', error);
    res.status(500).json({ error: 'Failed to update lead form message' });
  }
});

// POST /api/bots/:botId/notifications - Update notification settings
router.post('/:botId/notifications', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, enabled, emails } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );

    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    await query(
      'UPDATE bots SET conversation_notifications = $1, notification_emails = $2 WHERE id = $3',
      [enabled, emails, botId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update notifications error:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

export default router;
