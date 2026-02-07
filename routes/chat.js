import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db/database.js';
import { retrieveContext, storeLead } from '../services/rag.js';
import { Resend } from 'resend';

const router = express.Router();
const anthropic = new Anthropic();
const resend = new Resend(process.env.RESEND_API_KEY);

// POST /api/chat - Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { message, customerId, botId, sessionId, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get bot configuration
    let botConfig;
    if (botId) {
      const botResult = await query(
        'SELECT id, customer_id, bot_instructions FROM bots WHERE id = $1',
        [botId]
      );
      if (botResult.rows.length > 0) {
        botConfig = botResult.rows[0];
      }
    }

    if (!botConfig && customerId) {
      // Fallback to first bot for customer
      const botResult = await query(
        'SELECT id, customer_id, bot_instructions FROM bots WHERE customer_id = $1 ORDER BY created_at ASC LIMIT 1',
        [customerId]
      );
      if (botResult.rows.length > 0) {
        botConfig = botResult.rows[0];
      }
    }

    if (!botConfig) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const actualBotId = botConfig.id;
    const actualCustomerId = botConfig.customer_id;
    const botInstructions = botConfig.bot_instructions || 'You are a helpful assistant.';

    // Create or update chat session
    if (sessionId) {
      const existingSession = await query(
        'SELECT id FROM chat_sessions WHERE session_id = $1 AND bot_id = $2',
        [sessionId, actualBotId]
      );
      
      if (existingSession.rows.length === 0) {
        await query(
          'INSERT INTO chat_sessions (bot_id, session_id) VALUES ($1, $2)',
          [actualBotId, sessionId]
        );
      } else {
        await query(
          'UPDATE chat_sessions SET last_activity = NOW() WHERE session_id = $1 AND bot_id = $2',
          [sessionId, actualBotId]
        );
      }
    }

    // Retrieve context from RAG
    const context = await retrieveContext(actualCustomerId, message, 5, actualBotId);

    // Build system prompt
    let systemPrompt = botInstructions;
    if (context && context.length > 0) {
      systemPrompt += `\n\nUse the following information to help answer questions:\n${context}`;
    }

    // Build messages for Claude
    const claudeMessages = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
    claudeMessages.push({ role: 'user', content: message });

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages
    });

    const assistantMessage = response.content[0].text;

    // Save messages to database
    await query(
      'INSERT INTO messages (customer_id, bot_id, lead_id, session_id, role, content) VALUES ($1, $2, $3, $4, $5, $6)',
      [actualCustomerId, actualBotId, null, sessionId || null, 'user', message]
    );
    
    await query(
      'INSERT INTO messages (customer_id, bot_id, lead_id, session_id, role, content) VALUES ($1, $2, $3, $4, $5, $6)',
      [actualCustomerId, actualBotId, null, sessionId || null, 'assistant', assistantMessage]
    );

    res.json({ message: assistantMessage });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// POST /api/chat/lead - Capture lead information
router.post('/lead', async (req, res) => {
  try {
    const { name, email, customerId, botId, sessionId, conversation } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Get bot info
    let actualBotId = botId;
    let actualCustomerId = customerId;

    if (botId && !customerId) {
      const botResult = await query('SELECT customer_id FROM bots WHERE id = $1', [botId]);
      if (botResult.rows.length > 0) {
        actualCustomerId = botResult.rows[0].customer_id;
      }
    }

    // Store lead
    const leadResult = await storeLead(actualCustomerId, actualBotId, name, email, conversation);
    const leadId = leadResult?.id;

    // Update chat session with visitor info
    if (sessionId) {
      await query(
        'UPDATE chat_sessions SET visitor_name = $1, visitor_email = $2 WHERE session_id = $3 AND bot_id = $4',
        [name, email, sessionId, actualBotId]
      );
      
      // Also update messages with lead_id
      if (leadId) {
        await query(
          'UPDATE messages SET lead_id = $1 WHERE session_id = $2 AND bot_id = $3',
          [leadId, sessionId, actualBotId]
        );
      }
    }

    // Get customer info for email notification
    const customerResult = await query(
      'SELECT c.email as owner_email, c.name as owner_name, b.name as bot_name FROM customers c JOIN bots b ON b.customer_id = c.id WHERE b.id = $1',
      [actualBotId]
    );

    if (customerResult.rows.length > 0) {
      const { owner_email, owner_name, bot_name } = customerResult.rows[0];

      // Send email notification
      try {
        await resend.emails.send({
          from: 'AutoReplyChat <notifications@autoreplychat.com>',
          to: owner_email,
          subject: `New lead captured: ${name}`,
          html: `
            <h2>New Lead from ${bot_name}</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            ${conversation ? `
              <h3>Conversation:</h3>
              ${conversation.map(msg => `
                <p><strong>${msg.role === 'user' ? 'Visitor' : 'Bot'}:</strong> ${msg.content}</p>
              `).join('')}
            ` : ''}
          `
        });
      } catch (emailError) {
        console.error('Failed to send lead notification email:', emailError);
      }
    }

    res.json({ success: true, leadId });
  } catch (error) {
    console.error('Lead capture error:', error);
    res.status(500).json({ error: 'Failed to capture lead' });
  }
});

export default router;
