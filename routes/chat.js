import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { sendLeadNotification } from '../services/email.js';
import { retrieveContext, storeLead, getCustomer } from '../services/rag.js';

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// POST /api/chat - Handle chat messages with RAG
router.post('/chat', async (req, res) => {
  try {
    const { message, customerId, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Retrieve relevant context from customer's knowledge base
    const context = await retrieveContext(customerId || 1, message, 5);
    
    // Build system prompt with context
    let systemPrompt = 'You are a helpful assistant.';
    
    if (context && context.length > 0) {
      systemPrompt += '\n\nRelevant information from the knowledge base:\n\n';
      systemPrompt += context.map((chunk, idx) => `[${idx + 1}] ${chunk}`).join('\n\n');
      systemPrompt += '\n\nUse this information to answer the user\'s question. If the information is not in the knowledge base, say so politely.';
    }

    // Build conversation history for Claude
    const messages = conversationHistory || [];
    messages.push({
      role: 'user',
      content: message
    });

    // Call Claude API with context
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    const assistantMessage = response.content[0].text;

    res.json({
      message: assistantMessage,
      conversationId: customerId || 'default',
      contextUsed: context.length > 0
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
    
    // Store lead in database
    const leadId = await storeLead({
      customerId: customerId || 1,
      name,
      email,
      conversation: conversation || []
    });

    // Get customer info for email
    const customer = await getCustomer(customerId || 1);
    const businessEmail = customer?.business_email || process.env.TEST_BUSINESS_EMAIL || 'your-email@example.com';
    
    // Send email notification to business owner
    const emailResult = await sendLeadNotification({
      businessEmail,
      leadName: name,
      leadEmail: email,
      conversation: conversation || [],
      customerId: customerId || 'default'
    });

    if (!emailResult.success) {
      console.error('Failed to send email:', emailResult.error);
    }

    res.json({ 
      success: true,
      message: 'Lead captured successfully',
      leadId,
      emailSent: emailResult.success
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
