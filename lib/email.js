// Sends an email with one attachment via Gmail SMTP.
//
// Required env vars:
//   GMAIL_USER          - the Gmail address to send FROM (e.g. you@gmail.com)
//   GMAIL_APP_PASSWORD   - a 16-character Gmail "app password"
//                           (Google account -> Security -> 2-Step Verification
//                           -> App passwords). Your normal Gmail password will
//                           NOT work here.
//   BACKUP_TO_EMAIL      - the address to send TO (can be the same as GMAIL_USER)

const nodemailer = require('nodemailer');

async function sendWithAttachment({ subject, text, filename, content, contentType }){
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.BACKUP_TO_EMAIL;
  if(!user || !pass) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD env vars are not set');
  if(!to) throw new Error('BACKUP_TO_EMAIL env var is not set');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  await transporter.sendMail({
    from: user,
    to,
    subject,
    text,
    attachments: [{ filename, content, contentType }]
  });
}

module.exports = { sendWithAttachment };
