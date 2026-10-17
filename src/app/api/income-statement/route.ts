import { NextResponse } from 'next/server';
import { requireScope, unauthorized } from '@/lib/auth';
import { buildAnnualStatement } from '@/lib/statement';

export async function GET(req: Request) {
  try {
    const { scope } = await requireScope(req);
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));
    return NextResponse.json(await buildAnnualStatement(scope, year));
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') return unauthorized();
    return NextResponse.json({ error: 'Failed to build income statement' }, { status: 500 });
  }
}
