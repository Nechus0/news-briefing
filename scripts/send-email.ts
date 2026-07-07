/**
 * Sends the freshly generated briefing (public/data/latest.json) as a
 * formatted HTML email via Gmail SMTP (nodemailer). Runs right after
 * "npm run generate" in the GitHub Actions workflow, and can also be run
 * locally with "npm run send-email" once .env.local has the Gmail
 * credentials.
 *
 * Auth uses a Gmail "App Password" (requires 2-Step Verification on the
 * Google account), never the real account password - see README for setup.
 */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import type { NewsBrief, CategoryId } from '../src/types';
import { CATEGORY_ORDER, CATEGORY_LABELS } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const DATA_PATH = path.join(__dirname, '..', 'public', 'data', 'latest.json');

const CATEGORY_COLORS: Record<CategoryId, string> = {
  'global-health': '#059669',
  'german-politics': '#2563eb',
  'ukraine-war': '#dc2626',
  'middle-east-conflict': '#ea580c',
  'world-news': '#7c3aed',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCategory(brief: NewsBrief, id: CategoryId): string {
  const cat = brief.categories.find((c) => c.id === id);
  if (!cat) return '';
  const color = CATEGORY_COLORS[id];

  const sources = (cat.sources ?? [])
    .map(
      (s) =>
        `<a href="${escapeHtml(s.url)}" style="color:${color};text-decoration:none;font-size:13px;font-weight:600;">${escapeHtml(s.title)} &#8599;</a>`,
    )
    .join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;');

  return `
    <tr><td style="padding:0 0 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e6e8f0;border-left:4px solid ${color};border-radius:12px;">
        <tr><td style="padding:18px 20px;">
          <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color};margin-bottom:8px;">
            ${escapeHtml(cat.name || CATEGORY_LABELS[id])}
          </span>
          <div style="font-size:16px;font-weight:700;color:#12142a;line-height:1.4;margin-bottom:8px;">
            ${escapeHtml(cat.headline)}
          </div>
          <div style="font-size:14px;color:#3a3d52;line-height:1.55;margin-bottom:10px;">
            ${escapeHtml(cat.brief)}
          </div>
          ${
            cat.whyRelevant
              ? `<div style="font-size:13px;color:#5b6178;background:#f6f7fb;border-radius:8px;padding:9px 12px;margin-bottom:10px;">
                   <strong style="color:#3a3d52;">Warum relevant:</strong> ${escapeHtml(cat.whyRelevant)}
                 </div>`
              : ''
          }
          ${sources ? `<div style="margin-top:2px;">${sources}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>`;
}

function renderEmailHtml(brief: NewsBrief): string {
  const summaryItems = brief.executiveSummary
    .map(
      (line) =>
        `<li style="margin-bottom:8px;font-size:14px;color:#12142a;line-height:1.5;">${escapeHtml(line)}</li>`,
    )
    .join('');

  const categoryRows = CATEGORY_ORDER.map((id) => renderCategory(brief, id)).join('');

  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:4px 8px 18px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7c3aed;margin-bottom:4px;">
            Daily News Briefing
          </div>
          <div style="font-size:22px;font-weight:800;color:#12142a;">${escapeHtml(brief.formattedDate)}</div>
          <div style="font-size:13px;color:#5b6178;margin-top:2px;">Ausgabe ${escapeHtml(brief.schedule)} Uhr</div>
        </td></tr>
        <tr><td style="padding:0 0 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e6e8f0;border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#9298b0;margin-bottom:10px;">
                Executive Summary
              </div>
              <ul style="margin:0;padding-left:18px;">${summaryItems}</ul>
            </td></tr>
          </table>
        </td></tr>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${categoryRows}</table>
        <tr><td style="padding:14px 8px 4px;text-align:center;font-size:11px;color:#9298b0;">
          Automatisch erzeugt von Gemini &middot; ${new Date(brief.timestamp).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderEmailText(brief: NewsBrief): string {
  const lines = [`Daily News Briefing – ${brief.formattedDate}, ${brief.schedule} Uhr`, '', 'EXECUTIVE SUMMARY'];
  brief.executiveSummary.forEach((s) => lines.push(`- ${s}`));
  lines.push('');

  CATEGORY_ORDER.forEach((id) => {
    const cat = brief.categories.find((c) => c.id === id);
    if (!cat) return;
    lines.push(`${(cat.name || CATEGORY_LABELS[id]).toUpperCase()}`);
    lines.push(cat.headline);
    lines.push(cat.brief);
    if (cat.whyRelevant) lines.push(`Warum relevant: ${cat.whyRelevant}`);
    (cat.sources ?? []).forEach((s) => lines.push(`Quelle: ${s.title} – ${s.url}`));
    lines.push('');
  });

  return lines.join('\n');
}

async function main() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const recipient = process.env.RECIPIENT_EMAIL || gmailUser;

  if (!gmailUser || !gmailAppPassword) {
    console.log('GMAIL_USER / GMAIL_APP_PASSWORD nicht gesetzt – überspringe E-Mail-Versand.');
    return;
  }

  const raw = await fs.readFile(DATA_PATH, 'utf8');
  const brief = JSON.parse(raw) as NewsBrief;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  await transporter.sendMail({
    from: `"Daily News Briefing" <${gmailUser}>`,
    to: recipient,
    subject: `Daily News Briefing – ${brief.formattedDate}, ${brief.schedule} Uhr`,
    text: renderEmailText(brief),
    html: renderEmailHtml(brief),
  });

  console.log(`E-Mail gesendet an ${recipient}`);
}

main().catch((err) => {
  console.error('E-Mail-Versand fehlgeschlagen:', err);
  process.exitCode = 1;
});
