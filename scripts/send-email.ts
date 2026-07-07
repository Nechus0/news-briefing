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
  'feel-good-news': '#d97706',
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
  const isFeelGood = id === 'feel-good-news';

  const sources = (cat.sources ?? [])
    .map(
      (s) =>
        `<a href="${escapeHtml(s.url)}" style="color:${color};text-decoration:none;font-size:13px;font-weight:600;">${escapeHtml(s.title)} &#8599;</a>`,
    )
    .join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;');

  return `
    <tr><td style="padding:0 0 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${isFeelGood ? '#fffbeb' : '#ffffff'};border:1px solid ${isFeelGood ? '#fde68a' : '#e6e8f0'};border-left:4px solid ${color};border-radius:12px;">
        <tr><td style="padding:18px 20px;">
          <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color};margin-bottom:8px;">
            ${isFeelGood ? '&#10024; ' : ''}${escapeHtml(cat.name || CATEGORY_LABELS[id])}
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

/** Weather card for today's Berlin forecast - the whole card links out to
 * weather.sourceUrl (see scripts/weather.ts). Omitted entirely when
 * `weather` is undefined (fetch failed / no data), so a broken weather API
 * never leaves a half-empty card in the email. */
function renderWeather(brief: NewsBrief): string {
  const w = brief.weather;
  if (!w) return '';

  return `
    <tr><td style="padding:0 0 10px;">
      <a href="${escapeHtml(w.sourceUrl)}" target="_blank" style="display:block;text-decoration:none;color:inherit;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
          <tr>
            <td style="padding:16px 20px;width:56px;vertical-align:middle;">
              <span style="font-size:34px;line-height:1;">${w.icon}</span>
            </td>
            <td style="padding:16px 20px 16px 0;vertical-align:middle;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2563eb;margin-bottom:4px;">
                Wetter heute &middot; Berlin
              </div>
              <div style="font-size:16px;font-weight:700;color:#12142a;">
                ${w.tempMinC}&deg; &ndash; ${w.tempMaxC}&deg;C &middot; ${escapeHtml(w.description)}
              </div>
              <div style="font-size:13px;color:#3a3d52;margin-top:2px;">
                Regenwahrscheinlichkeit: ${w.precipitationProbability}% &nbsp;&middot;&nbsp; Details auf wetter.com &#8599;
              </div>
            </td>
          </tr>
        </table>
      </a>
    </td></tr>`;
}

/** Today's Google Calendar agenda. Omitted entirely when `calendar` is
 * undefined (not configured / fetch failed). Shows a friendly empty state
 * when it IS configured but there simply are no events today. */
function renderCalendar(brief: NewsBrief): string {
  const events = brief.calendar;
  if (events === undefined) return '';

  const rows = events.length
    ? events
        .map(
          (e) => `
          <tr>
            <td style="padding:4px 10px 4px 0;font-size:13px;font-weight:700;color:#12142a;white-space:nowrap;vertical-align:top;width:78px;">
              ${escapeHtml(e.time)}
            </td>
            <td style="padding:4px 0;font-size:13px;color:#3a3d52;vertical-align:top;">
              ${escapeHtml(e.title)}${e.location ? `<span style="color:#9298b0;"> &middot; ${escapeHtml(e.location)}</span>` : ''}
            </td>
          </tr>`,
        )
        .join('')
    : `<tr><td style="padding:4px 0;font-size:13px;color:#5b6178;">Keine Termine heute &#127881;</td></tr>`;

  return `
    <tr><td style="padding:0 0 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e6e8f0;border-radius:12px;">
        <tr><td style="padding:16px 20px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#9298b0;margin-bottom:10px;">
            Termine heute
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
      </table>
    </td></tr>`;
}

export function renderEmailHtml(brief: NewsBrief): string {
  const summaryItems = brief.executiveSummary
    .map(
      (line) =>
        `<li style="margin-bottom:8px;font-size:14px;color:#12142a;line-height:1.5;">${escapeHtml(line)}</li>`,
    )
    .join('');

  const categoryRows = CATEGORY_ORDER.map((id) => renderCategory(brief, id)).join('');
  const glanceRows = `${renderWeather(brief)}${renderCalendar(brief)}`;

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
        ${glanceRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${glanceRows}</table>` : ''}
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

export function renderEmailText(brief: NewsBrief): string {
  const lines = [`Daily News Briefing – ${brief.formattedDate}, ${brief.schedule} Uhr`, ''];

  if (brief.weather) {
    const w = brief.weather;
    lines.push(
      `WETTER BERLIN: ${w.tempMinC}–${w.tempMaxC}°C, ${w.description}, Regenwahrscheinlichkeit ${w.precipitationProbability}% (${w.sourceUrl})`,
    );
  }
  if (brief.calendar) {
    lines.push('TERMINE HEUTE:');
    if (brief.calendar.length === 0) {
      lines.push('- Keine Termine heute');
    } else {
      brief.calendar.forEach((e) => lines.push(`- ${e.time}  ${e.title}${e.location ? ` (${e.location})` : ''}`));
    }
  }
  if (brief.weather || brief.calendar) lines.push('');

  lines.push('EXECUTIVE SUMMARY');
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
