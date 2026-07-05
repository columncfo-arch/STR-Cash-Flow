import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const NOTIFY_TO = 'column.cfo@gmail.com';

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: 'No API key' }, { status: 500 });

  try {
    const { name, email, propertyName } = await req.json() as {
      name?: string; email?: string; propertyName?: string;
    };

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: 'HostCFO <onboarding@resend.dev>',
      to: NOTIFY_TO,
      subject: `New HostCFO sign-up: ${name || email || 'unknown'}`,
      text: [
        'New trial sign-up on HostCFO',
        '',
        `Name:     ${name || '—'}`,
        `Email:    ${email || '—'}`,
        `Property: ${propertyName || '—'}`,
        `Time:     ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
      ].join('\n'),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('notify-signup error', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
