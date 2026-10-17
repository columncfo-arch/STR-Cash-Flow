import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, saveAccount } from '@/lib/storage';
import { requireScope, unauthorized, AuthError } from '@/lib/auth';
import { Settings } from '@/types';

/**
 * A property's settings.
 *
 * The name lives on the property itself, where the switcher and the portfolio
 * read it, and is overlaid here so the two can never drift apart — renaming on
 * the Settings page and renaming in the switcher are the same act.
 */
export async function GET() {
  try {
    const { account, scope } = await requireScope();
    const settings = await loadSettings(scope);
    const property = account.properties.find(p => p.id === scope.propertyId);
    return NextResponse.json({
      ...settings,
      propertyName: property?.name ?? settings.propertyName,
      currency: account.currency ?? settings.currency,
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Settings GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { userId, account, scope } = await requireScope(req);
    const body: Settings = await req.json();
    await saveSettings(scope, body);

    // Carry a rename, and the currency, back to where they are authoritative
    const name = body.propertyName?.trim();
    const property = account.properties.find(p => p.id === scope.propertyId);
    const renamed = Boolean(name && property && name !== property.name);
    const currencyChanged = Boolean(body.currency && body.currency !== account.currency);
    if (renamed || currencyChanged) {
      await saveAccount(userId, {
        ...account,
        currency: body.currency || account.currency,
        properties: account.properties.map(p =>
          p.id === scope.propertyId && name ? { ...p, name } : p,
        ),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Settings PUT error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
