import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// POST /api/chat - Handle chat messages
router.post('/chat', async (req, res) => {
  try {
    const { message, customerId, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build conversation history for Claude
    const messages = conversationHistory || [];
    messages.push({
      role: 'user',
      content: message
    });

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: messages,
      // TODO: Add customer-specific context from RAG here later
    });

    const assistantMessage = response.content[0].text;

    res.json({
      message: assistantMessage,
      conversationId: customerId || 'default'
    });

  } catch (error) {
    console.error('Claude API error:', error);
    res.status(500).json({ 
      error: 'Failed to get response',
      details: error.message 
    });
  }
});

// POST /api/lead - Capture lead information
router.post('/lead', async (req, res) => {
  try {
    const { name, email, customerId, conversation } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    console.log('Lead captured:', { name, email, customerId });
    
    // TODO: Store in database
    // TODO: Send email notification to business owner

    res.json({ 
      success: true,
      message: 'Lead captured successfully' 
    });

  } catch (error) {
    console.error('Lead capture error:', error);
    res.status(500).json({ 
      error: 'Failed to capture lead',
      details: error.message 
    });
  }
});

export default router;
