/**
 * GOOGLE APPS SCRIPT - CANVA OTP FORWARDER WEBHOOK
 * Deploy this script in Google Apps Script under ceksosial3@gmail.com account.
 * Set up a Time-driven Trigger (e.g. Every 1 Minute) for function `checkCanvaOtpEmails`.
 */

const WEBHOOK_URL = "https://your-nextjs-app.vercel.app/api/webhooks/otp";
const SECRET_KEY = "your_super_secret_webhook_key_here";

function checkCanvaOtpEmails() {
  // Search for Canva OTP / verification emails in Gmail
  const query = 'from:canva.com subject:code OR subject:OTP OR subject:verification is:unread';
  const threads = GmailApp.search(query, 0, 5);

  for (let i = 0; i < threads.length; i++) {
    const messages = threads[i].getMessages();
    for (let j = 0; j < messages.length; j++) {
      const msg = messages[j];
      if (msg.isUnread()) {
        const body = msg.getPlainBody();
        const subject = msg.getSubject();
        const sender = msg.getFrom();
        const messageId = msg.getId();
        const date = msg.getDate();

        // Extract 6-digit code or numeric code from body/subject using Regex
        const codeMatch = body.match(/\b\d{6}\b/) || subject.match(/\b\d{6}\b/);

        if (codeMatch) {
          const otpCode = codeMatch[0];

          const payload = {
            code: otpCode,
            sender: sender,
            subject: subject,
            gmail_message_id: messageId,
            received_at: date.toISOString(),
            secret_key: SECRET_KEY
          };

          const options = {
            method: "post",
            contentType: "application/json",
            headers: {
              "x-secret-key": SECRET_KEY
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
          };

          try {
            const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
            Logger.log("Webhook Response: " + response.getContentText());
            
            // Mark email as read after successful relay
            msg.markRead();
          } catch (e) {
            Logger.log("Error sending webhook: " + e.toString());
          }
        }
      }
    }
  }
}
