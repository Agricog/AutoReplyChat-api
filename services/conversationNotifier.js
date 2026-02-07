import { query } from '../db/database.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Check for conversations needing notification every 30 seconds
export function startConversationNotifier() {
  console.log('🔔 Conversation notifier started');
  
  // Run every 30 seconds
  setInterval(async () => {
    await checkAndSendNotifications();
  }, 30000);
  
  // Also run immediately on startup
  setTimeout(async () => {
    await checkAndSendNotifications();
  }, 5000);
}

async function checkAndSendNotifications() {
  try {
    // Find chat sessions with messages older than 1 minute that haven't been notified
    const result = await query(`
      SELECT DISTINCT ON (cs.id)
        cs.id as session_id,
        cs.session_id as session_key,
        cs.visitor_name,
        cs.visitor_email,
        cs.bot_id,
        cs.created_at as session_created_at,
        cs.last_activity,
        b.name as bot_name,
        b.notification_emails,
        b.conversation_notifications
      FROM chat_sessions cs
      JOIN bots b ON cs.bot_id = b.id
      WHERE b.conversation_notifications = true
        AND b.notification_emails IS NOT NULL
        AND b.notification_emails != ''
        AND cs.notification_sent_at IS NULL
        AND cs.last_activity < NOW() - INTERVAL '1 minute'
      ORDER BY cs.id
      LIMIT 10
    `);
    
    for (const session of result.rows) {
      await sendConversationTranscript(session);
    }
  } catch (error) {
    console.error('Conversation notifier error:', error);
  }
}

async function sendConversationTranscript(session) {
  try {
    // Get all messages for this session
    const messagesResult = await query(`
      SELECT role, content, created_at
      FROM messages
      WHERE session_id = $1 AND bot_id = $2
      ORDER BY created_at ASC
    `, [session.session_key, session.bot_id]);
    
    if (messagesResult.rows.length === 0) {
      // No messages, mark as notified to avoid retry
      await query('UPDATE chat_sessions SET notification_sent_at = NOW() WHERE id = $1', [session.session_id]);
      return;
    }
    
    // Build transcript HTML
    const messages = messagesResult.rows;
    let transcriptHtml = messages.map(msg => {
      const time = new Date(msg.created_at).toLocaleString();
      const sender = msg.role === 'user' ? '👤 Visitor' : '🤖 Bot';
      const bgColor = msg.role === 'user' ? '#f3f4f6' : '#eff6ff';
      return `
        <div style="margin-bottom: 12px; padding: 12px; background: ${bgColor}; border-radius: 8px;">
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">${sender} • ${time}</div>
          <div style="color: #1f2937;">${msg.content}</div>
        </div>
      `;
    }).join('');
    
    // Parse email addresses
    const emails = session.notification_emails.split(',').map(e => e.trim()).filter(e => e);
    
    if (emails.length === 0) {
      await query('UPDATE chat_sessions SET notification_sent_at = NOW() WHERE id = $1', [session.session_id]);
      return;
    }
    
    // Build email
    const visitorInfo = session.visitor_name && session.visitor_email 
      ? `<p><strong>Visitor:</strong> ${session.visitor_name} (${session.visitor_email})</p>`
      : '<p><strong>Visitor:</strong> Anonymous</p>';
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">New Conversation - ${session.bot_name}</h2>
          </div>
          <div class="content">
            ${visitorInfo}
            <p><strong>Started:</strong> ${new Date(session.session_created_at).toLocaleString()}</p>
            <p><strong>Messages:</strong> ${messages.length}</p>
            
            <h3 style="margin-top: 24px; margin-bottom: 16px; color: #374151;">Conversation Transcript</h3>
            ${transcriptHtml}
          </div>
          <div class="footer">
            <p>This notification was sent by AutoReplyChat.</p>
            <p>You can manage notification settings in your dashboard.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    // Send email
    await resend.emails.send({
      from: 'AutoReplyChat <notifications@autoreplychat.com>',
      to: emails,
      subject: `New conversation on ${session.bot_name}${session.visitor_name ? ` from ${session.visitor_name}` : ''}`,
      html: emailHtml
    });
    
    console.log(`✉️ Sent conversation transcript for session ${session.session_id} to ${emails.join(', ')}`);
    
    // Mark as notified
    await query('UPDATE chat_sessions SET notification_sent_at = NOW() WHERE id = $1', [session.session_id]);
    
  } catch (error) {
    console.error(`Failed to send transcript for session ${session.session_id}:`, error);
  }
}
