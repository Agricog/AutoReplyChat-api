import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendLeadNotification({ 
  businessEmail, 
  leadName, 
  leadEmail, 
  conversation,
  customerId 
}) {
  try {
    // Format conversation for email
    const conversationHtml = conversation
      .map(msg => {
        if (msg.role === 'user') {
          return `<div style="margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 5px;">
            <strong>Visitor:</strong> ${msg.content}
          </div>`;
        } else if (msg.role === 'assistant') {
          return `<div style="margin: 10px 0; padding: 10px; background: #e3f2fd; border-radius: 5px;">
            <strong>Assistant:</strong> ${msg.content}
          </div>`;
        }
        return '';
      })
      .join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; border-radius: 5px; }
            .lead-info { background: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .conversation { margin: 20px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🎯 New Lead Captured!</h2>
            </div>
            
            <div class="lead-info">
              <h3>Lead Information</h3>
              <p><strong>Name:</strong> ${leadName}</p>
              <p><strong>Email:</strong> <a href="mailto:${leadEmail}">${leadEmail}</a></p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Customer ID:</strong> ${customerId}</p>
            </div>
            
            <div class="conversation">
              <h3>Conversation History</h3>
              ${conversationHtml}
            </div>
            
            <div class="footer">
              <p>This lead was captured through your AutaiChat chatbot.</p>
              <p>Reply directly to ${leadEmail} to follow up.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: 'AutaiChat Notifications <notifications@shootsync.co.uk>',
      to: [businessEmail],
      subject: `New Lead: ${leadName}`,
      html: emailHtml,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error };
    }

    console.log('Email sent successfully:', data);
    return { success: true, data };

  } catch (error) {
    console.error('Email service error:', error);
    return { success: false, error: error.message };
  }
}
