/**
 * Outgoing email. With SMTP configured it sends through nodemailer; without it (local
 * development) it logs the message instead, so flows like password reset still work
 * end to end - the link appears in the server log.
 */
const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../logger');

let transport = null;
function getTransport() {
  if (!config.smtp.host) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) {
    logger.info({ to, subject, text }, 'email not sent: SMTP is not configured (development mailer)');
    return { delivered: false };
  }
  await t.sendMail({ from: config.smtp.from, to, subject, text });
  return { delivered: true };
}

module.exports = { sendMail };
