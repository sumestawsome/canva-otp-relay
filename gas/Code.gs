/**
 * GOOGLE APPS SCRIPT - CANVA OTP FORWARDER WEBHOOK
 * Deploy this script in Google Apps Script under your team mailbox account.
 * Set up a Time-driven Trigger (e.g. Every 1 Minute) for function `checkCanvaOtp`.
 */

const WEBHOOK_URL = "https://canva-otp-relay.vercel.app/api/webhooks/otp";
const SECRET_KEY = "CANVA202enam"; // Pastikan WEBHOOK_SECRET_KEY di Vercel persis seperti ini

function checkCanvaOtp() {
  // Mencari email belum terbaca dari Canva
  var threads = GmailApp.search('from:canva is:unread', 0, 5);
  
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j];
      if (msg.isUnread()) {
        var body = msg.getPlainBody() || msg.getSubject();
        
        // Regex 6 digit angka kode verifikasi Canva
        var match = body.match(/\b\d{6}\b/); 
        
        if (match) {
          var otpCode = match[0];
          
          var payload = {
            code: otpCode,
            sender: msg.getFrom(),
            subject: msg.getSubject(),
            gmail_message_id: msg.getId(),
            received_at: msg.getDate().toISOString(),
            secret_key: SECRET_KEY
          };
          
          var options = {
            'method': 'post',
            'contentType': 'application/json',
            'payload': JSON.stringify(payload),
            'muteHttpExceptions': true // Mencegah crash jika endpoint mengembalikan status non-200
          };
          
          try {
            var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
            var responseCode = response.getResponseCode();
            var responseText = response.getContentText();
            Logger.log('HTTP Status: ' + responseCode + ' | Response: ' + responseText);
            
            if (responseCode === 200) {
              // Tandai email sudah dibaca setelah berhasil dikirim
              msg.markRead();
              Logger.log('OTP berhasil diteruskan ke dashboard: ' + otpCode);
            } else {
              Logger.log('Gagal mengirimkan OTP. Status: ' + responseCode);
            }
          } catch (e) {
            Logger.log('Error mengirim webhook: ' + e.toString());
          }
        }
      }
    }
  }
}
