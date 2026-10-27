export async function reportError(code: string, requestId: string) {
  if (!process.env.SENTRY_DSN) return;
  try {
    const dsn = new URL(process.env.SENTRY_DSN);
    const project = dsn.pathname.split('/').filter(Boolean).pop();
    const eventId = crypto.randomUUID().replaceAll('-', '');
    const endpoint =
      dsn.protocol +
      '//' +
      dsn.host +
      '/api/' +
      project +
      '/envelope/?sentry_key=' +
      dsn.username +
      '&sentry_version=7';
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      message: code,
      tags: { request_id: requestId, environment: process.env.APP_ENV || 'development' },
    };
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body:
        JSON.stringify({ event_id: eventId }) +
        '\n' +
        JSON.stringify({ type: 'event' }) +
        '\n' +
        JSON.stringify(event),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* Monitoring failure never changes transaction behavior. */
  }
}
