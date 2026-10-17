import { NextResponse } from 'next/server';
import { requireScope, unauthorized } from '@/lib/auth';
import { AuthError } from '@/lib/auth';
import { allScopes, loadSettings } from '@/lib/storage';
import { buildAnnualStatement } from '@/lib/statement';
import { AnnualStatement, MonthlyStatement, Property } from '@/types';

/** A property's year, and what it is being held to. */
export interface PortfolioEntry {
  property: Property;
  /** Months carry their totals but not their individual bookings — the
   *  portfolio view aggregates, and a year of stays for every unit is the bulk
   *  of the payload for figures nothing on that page reads. */
  statement: Omit<AnnualStatement, 'months'> & { months: Omit<MonthlyStatement, 'bookings'>[] };
  target: {
    /** The year's gross revenue goal, if one has been set for this unit. */
    annualRevenue: number | null;
    /** Last year's twelve actuals, which is how the goal is split across months. */
    priorMonthlyRevenue: number[] | null;
    occupancyPct: number | null;
    adr: number | null;
    monthlyPITI: number;
    /**
     * What each layer kept of gross last year. Only gross revenue has a goal
     * anybody set, so these are what turn it into a goal for the layers beneath
     * — and they come from a finished year rather than from the figures being
     * judged, which would make every layer hit its mark by construction.
     * Null when there is no prior year to learn from.
     */
    priorMargins: { netRevenue: number; operatingIncome: number; contribution: number } | null;
  };
}

/** A month's totals without the stays behind them. */
function stripBookings(month: MonthlyStatement): Omit<MonthlyStatement, 'bookings'> {
  const copy: Partial<MonthlyStatement> = { ...month };
  delete copy.bookings;
  return copy as Omit<MonthlyStatement, 'bookings'>;
}

/**
 * Every property's year in one call, for the portfolio view.
 *
 * Each unit's statement is built by the same function the single-property pages
 * use, so a figure here and the same figure on a property's own page cannot
 * disagree. Settings are not returned: they carry the Hostex token.
 */
export async function GET(req: Request) {
  try {
    const { userId, account } = await requireScope(req);
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));

    const entries = await Promise.all(
      allScopes(userId, account).map(async ({ property, scope }): Promise<PortfolioEntry> => {
        const [{ statement }, { statement: priorYear }, settings] = await Promise.all([
          buildAnnualStatement(scope, year),
          buildAnnualStatement(scope, year - 1),
          loadSettings(scope),
        ]);
        const priorGross = priorYear.grossRevenue;
        // Contribution margin is taken before PITI so the fixed payment is
        // subtracted once, at the window's own length, rather than being baked
        // into a ratio and scaled by revenue.
        const priorMargins = priorGross > 0 ? {
          netRevenue: priorYear.netRevenue / priorGross,
          operatingIncome: priorYear.operatingIncome / priorGross,
          contribution: (priorYear.netIncome + priorYear.piti) / priorGross,
        } : null;

        const override = settings.forecastOverrides?.[String(year)];
        const prior = settings.forecastOverrides?.[String(year - 1)]?.monthlyRevenue;
        return {
          property,
          statement: {
            ...statement,
            months: statement.months.map(stripBookings),
          },
          target: {
            annualRevenue: override?.revenue ?? null,
            priorMonthlyRevenue: prior && prior.some(v => v > 0) ? prior : null,
            occupancyPct: settings.targetOccupancyPct ?? null,
            adr: settings.targetAdr ?? null,
            monthlyPITI: settings.monthlyPITI ?? 0,
            priorMargins,
          },
        };
      }),
    );

    return NextResponse.json({ year, currency: account.currency, entries });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized();
    console.error('Portfolio GET error:', err);
    return NextResponse.json({ error: 'Failed to build the portfolio' }, { status: 500 });
  }
}
