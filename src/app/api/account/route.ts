import { NextResponse } from 'next/server';
import { loadAccount, saveAccount } from '@/lib/storage';
import { requireAuth, unauthorized, AuthError } from '@/lib/auth';
import { Property, PropertyModel } from '@/types';

/** How it is let. Anything unrecognised reads as short-term, as absence does. */
const cleanModel = (raw: unknown): PropertyModel => (raw === 'ltr' ? 'ltr' : 'str');

/** A property name that is safe to show and distinct from the others. */
function cleanName(raw: unknown, taken: string[]): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().slice(0, 80);
  if (!name) return null;
  if (taken.some(t => t.toLowerCase() === name.toLowerCase())) return null;
  return name;
}

export async function GET() {
  try {
    const userId = await requireAuth();
    return NextResponse.json(await loadAccount(userId));
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Account GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** Add a property. It starts empty — nothing is copied from any other unit. */
export async function POST(req: Request) {
  try {
    const userId = await requireAuth();
    const account = await loadAccount(userId);
    const { name, model } = await req.json() as { name?: string; model?: string };

    const clean = cleanName(name, account.properties.map(p => p.name));
    if (!clean) {
      return NextResponse.json({ error: 'Give the property a name it does not already have' }, { status: 400 });
    }

    const property: Property = {
      id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: clean,
      model: cleanModel(model),
      createdAt: new Date().toISOString(),
    };
    // Switch to it: the only reason to add one is to set it up
    const next = { ...account, properties: [...account.properties, property], activePropertyId: property.id };
    await saveAccount(userId, next);
    return NextResponse.json(next, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Account POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * Switch the property in view, rename one, or archive it.
 *
 * Archiving hides a unit from the portfolio and leaves its books alone, so
 * closing a property can never be the thing that loses its history. There is no
 * delete here for the same reason.
 */
export async function PUT(req: Request) {
  try {
    const userId = await requireAuth();
    const account = await loadAccount(userId);
    const { activePropertyId, id, name, model, archived, claimExternalId } = await req.json() as {
      activePropertyId?: string; id?: string; name?: string; model?: string;
      archived?: boolean; claimExternalId?: string;
    };

    let properties = account.properties;

    if (id) {
      const target = properties.find(p => p.id === id);
      if (!target) return NextResponse.json({ error: 'No such property' }, { status: 404 });

      if (name !== undefined) {
        const clean = cleanName(name, properties.filter(p => p.id !== id).map(p => p.name));
        if (!clean) {
          return NextResponse.json({ error: 'Give the property a name it does not already have' }, { status: 400 });
        }
        properties = properties.map(p => p.id === id ? { ...p, name: clean } : p);
      }

      // Converting a unit is a relabelling, not a migration: its bookings and
      // its leases are both still its revenue either way
      if (model !== undefined) {
        properties = properties.map(p => p.id === id ? { ...p, model: cleanModel(model) } : p);
      }

      if (claimExternalId) {
        // A platform unit answers to one property. Claiming it here takes it
        // from whichever property held it, so a mistake is correctable by
        // claiming it somewhere else rather than being permanent.
        properties = properties.map(p => ({
          ...p,
          externalIds: p.id === id
            ? Array.from(new Set([...(p.externalIds ?? []), claimExternalId]))
            : (p.externalIds ?? []).filter(x => x !== claimExternalId),
        }));
      }

      if (archived !== undefined) {
        // One unit has to remain, or the app has nothing to show
        const liveAfter = properties.filter(p => (p.id === id ? !archived : !p.archived));
        if (liveAfter.length === 0) {
          return NextResponse.json({ error: 'At least one property must stay active' }, { status: 400 });
        }
        properties = properties.map(p => p.id === id ? { ...p, archived } : p);
      }
    }

    const live = properties.filter(p => !p.archived);
    const requestedActive = activePropertyId ?? account.activePropertyId;
    // Never leave an archived or unknown property in view
    const active = live.some(p => p.id === requestedActive) ? requestedActive : live[0].id;

    const next = { ...account, properties, activePropertyId: active };
    await saveAccount(userId, next);
    return NextResponse.json(next);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Account PUT error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
