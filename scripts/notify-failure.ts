/**
 * Last-resort safety net for .github/workflows/deploy.yml: sent only when
 * every scheduled attempt of the day (env.SEND_HOUR-1, SEND_HOUR and
 * SEND_HOUR+1, each :45 Europe/Berlin) has failed and no briefing went out,
 * so the failure is visible somewhere other than the Actions log. Uses the
 * same Gmail SMTP setup as send-email.ts.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

async function main() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const recipient = process.env.RECIPIENT_EMAIL || gmailUser;

  if (!gmailUser || !gmailAppPassword) {
    console.log('GMAIL_USER / GMAIL_APP_PASSWORD nicht gesetzt – überspringe Fehler-Benachrichtigung.');
    return;
  }

  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  const today = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });

  // Mirrors the gate logic in .github/workflows/deploy.yml so this text
  // always names the three slots that were actually configured, instead of
  // a hardcoded time going stale the next time SEND_HOUR is changed.
  const sendHour = Number(process.env.SEND_HOUR ?? '8');
  const prevHour = (sendHour - 1 + 24) % 24;
  const nextHour = (sendHour + 1) % 24;
  const slots = `${pad(prevHour)}:45, ${pad(sendHour)}:45, ${pad(nextHour)}:45 Uhr Europe/Berlin`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  await transporter.sendMail({
    from: `"Daily News Briefing" <${gmailUser}>`,
    to: recipient,
    subject: `Daily News Briefing – Versand am ${today} fehlgeschlagen`,
    text: [
      `Das Daily News Briefing konnte heute (${today}) nach mehreren Versuchen (${slots}) nicht erzeugt oder versendet werden.`,
      runUrl ? `Details im fehlgeschlagenen Workflow-Lauf: ${runUrl}` : 'Details siehe GitHub Actions Log.',
      'Ein Protokoll aller Versuche (Datum, Uhrzeit, Erfolg/Fehlschlag) findest du außerdem in logs/send-log.txt im Repo.',
    ].join('\n\n'),
  });

  console.log(`Fehler-Benachrichtigung gesendet an ${recipient}`);
}

main().catch((err) => {
  console.error('Versand der Fehler-Benachrichtigung fehlgeschlagen:', err);
  process.exitCode = 1;
});
