import express from 'express';
import { query } from '../db/database.js';

const router = express.Router();

// POST /api/bots - Create a new bot
router.post('/', async (req, res) => {
  try {
    const { customerId, name } = req.body;
    
    if (!customerId || !name) {
      return res.status(400).json({ error: 'customerId and name are required' });
    }
    
    // Verify session
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const result = await query(
      `INSERT INTO bots (customer_id, name, bot_instructions) 
       VALUES ($1, $2, 'You are a helpful assistant.')
       RETURNING id`,
      [customerId, name]
    );
    
    res.json({ success: true, botId: result.rows[0].id });
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'Failed to create bot' });
  }
});

// GET /api/bots/:botId/settings - Get bot settings (public, no auth needed for widget)
router.get('/:botId/settings', async (req, res) => {
  try {
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

// DELETE /api/bots/:botId - Delete a bot
router.delete('/:botId', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId } = req.body;
    
    // Verify session
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check bot belongs to customer
    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );
    
    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Check customer has more than one bot
    const countResult = await query(
      'SELECT COUNT(*) as count FROM bots WHERE customer_id = $1',
      [customerId]
    );
    
    if (parseInt(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete your only bot' });
    }
    
    // Delete related data first (cascade should handle this, but being explicit)
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
    
    // Verify session
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check bot belongs to customer
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
    
    // Verify session
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check bot belongs to customer
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

// POST /api/bots/:botId/appearance - Update appearance settings
router.post('/:botId/appearance', async (req, res) => {
  try {
    const botId = parseInt(req.params.botId);
    const { customerId, headerTitle, headerColor, textColor } = req.body;
    
    // Verify session
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check bot belongs to customer
    const botCheck = await query(
      'SELECT id FROM bots WHERE id = $1 AND customer_id = $2',
      [botId, customerId]
    );
    
    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    await query(
      'UPDATE bots SET header_title = $1, header_color = $2, text_color = $3 WHERE id = $4',
      [headerTitle, headerColor, textColor, botId]
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
    
    // Verify session
    if (parseInt(customerId) !== req.session.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check bot belongs to customer
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

export default router;
