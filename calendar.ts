/**
 * Fetches today's events from Google Calendar so send-email.ts can show a
 * short agenda in the daily briefing. Runs unattended in GitHub Actions
 * (no browser, no interactive login), so authentication is a Google Cloud
 * *service account* rather than a normal user OAuth flow:
 *
 *   1. Create a service account + JSON key in Google Cloud Console.
 *   2. Share your Google Calendar with the service account's email address
 *      (Settings > "Share with specific people" > role "See all event
 *      details" is enough, read-only).
 *   3. Store the full JSON key as the GOOGLE_SERVICE_ACCOUNT_KEY secret and
 *      the shared calendar's ID (usually your Gmail address) as
 *      GOOGLE_CALENDAR_ID.
 *
 * See README.md for the full step-by-step. If either secret is missing this
 * quietly returns null and send-email.ts simply omits the calendar card -
 * a missing/misconfigured calendar should never break the news send.
 */
import { JWT } from 'google-auth-library';
import type { CalendarEvent } from '../src/types';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function berlinDateStr(d: Date): string {
  // en-CA formats as YYYY-MM-DD, which is exactly what we need to compare
  // "which Berlin calendar day does this event fall on" without doing
  // manual UTC-offset/DST math.
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
}

function berlinTimeStr(d: Date): string {
  return d.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function getAccessToken(serviceAccountKeyRaw: string): Promise<string> {
  const key = JSON.parse(serviceAccountKeyRaw) as { client_email: string; private_key: string };
  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [CALENDAR_SCOPE],
  });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Kein Access Token vom Service Account erhalten.');
  return token;
}

interface GoogleCalendarApiEvent {
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
}

/** Returns null when the calendar isn't configured or the fetch failed
 * (never throws - a broken calendar integration must not stop the whole
 * briefing from generating/sending). Returns [] when the calendar is
 * configured and reachable but genuinely has no events today. */
export async function fetchTodayCalendarEvents(): Promise<CalendarEvent[] | null> {
  const serviceAccountKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || process.env.GMAIL_USER;

  if (!serviceAccountKeyRaw || !calendarId) {
    console.log('Kein Google-Kalender konfiguriert (GOOGLE_SERVICE_ACCOUNT_KEY/GOOGLE_CALENDAR_ID fehlen) – überspringe Kalender-Karte.');
    return null;
  }

  try {
    const accessToken = await getAccessToken(serviceAccountKeyRaw);
    const today = berlinDateStr(new Date());

    // Fetch a generous +/-1 day window in UTC so the target Berlin day is
    // fully covered regardless of the current UTC offset (CET/CEST), then
    // filter down to "today" precisely by comparing each event's own
    // Berlin-local date below. Simpler and more robust than computing the
    // exact Berlin midnight boundary by hand.
    const now = new Date();
    const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: 'Europe/Berlin',
      maxResults: '20',
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Google Calendar API HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as { items?: GoogleCalendarApiEvent[] };
    const items = data.items ?? [];

    const events: CalendarEvent[] = items
      .filter((item) => {
        if (item.start?.date) return item.start.date === today; // all-day event
        if (item.start?.dateTime) return berlinDateStr(new Date(item.start.dateTime)) === today;
        return false;
      })
      .map((item) => {
        const allDay = Boolean(item.start?.date);
        return {
          title: item.summary || '(Ohne Titel)',
          time: allDay ? 'Ganztägig' : berlinTimeStr(new Date(item.start!.dateTime!)),
          allDay,
          location: item.location || undefined,
        };
      });

    return events;
  } catch (err) {
    console.warn('Kalenderabruf fehlgeschlagen, überspringe Kalender-Karte:', err);
    return null;
  }
}
