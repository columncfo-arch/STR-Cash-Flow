import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAuth, unauthorized } from '@/lib/auth';

const NOTIFY_TO = 'column.cfo@gmail.com';

export async function POST(req: Request) {
  try {
    const userId = await requireAuth();
    const { name, email, propertyName, note } = await req.json() as {
      name?: string;
      email?: string;
      propertyName?: string;
      note?: string;
    };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: true }); // silently succeed in dev

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: 'HostCFO <onboarding@resend.dev>',
      to: NOTIFY_TO,
      subject: `Setup help request — ${name || email || userId}`,
      text: [
        `New setup help request from HostCFO`,
        ``,
        `Name:     ${name || '(not provided)'}`,
        `Email:    ${email || '(not provided)'}`,
        `Property: ${propertyName || '(not provided)'}`,
        `User ID:  ${userId}`,
        ``,
        note ? `Their note:\n${note}` : '(no note left)',
      ].join('\n'),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized();
    return NextResponse.json({ ok: true }); // don't surface email errors to client
  }
}
