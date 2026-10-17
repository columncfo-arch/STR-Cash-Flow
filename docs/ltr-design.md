# Long-term rentals: design

What a lease is, how its money is recognised, and what that changes elsewhere.
Settled with the owner before any of it was built; the open questions at the end
are the ones deliberately left open.

## Decisions

**A property's model is a label, not a switch.** A unit's revenue is its
bookings plus its leases, always. Nothing in the accounting branches on
`model`. A property let nightly for half a year and leased for the rest reports
both with no special case — which is exactly what converting one looks like, and
means conversion needs no migration.

**Rent prorates by day at both ends.** A lease running from the 20th earns
eleven days of that month at the monthly rate ÷ days in that month. Whole months
are unaffected.

**Rent is a fixed monthly amount plus charges.** Recurring add-ons — parking,
amenity, pet rent, a flat utility fee — bill monthly alongside it. One-off
charges, such as a late fee, land on a date. Both are the same kind of record
with different recurrence.

**Utilities are billed flat, not passed through.** A fixed monthly fee, so it is
revenue like parking is, and the actual bills are ordinary operating expenses.
No matching between a charge and a bill, and over- or under-recovery shows up by
itself in NOI.

**ADR does not apply to a leased unit.** It is revenue ÷ nights sold, and a
lease sells no nights. The ledger shows nothing rather than a number that invites
comparison with a nightly rate.

**Occupancy counts leased days.** Nights sold plus days under lease, over days in
the month. A leased unit reads ~100%; a turnover month reads the part of it that
was covered.

**Cumulative charts move both ways.** Gross and net revenue only ever climb, but
NOI and cash flow fall in any month whose costs exceed its revenue. The lines
follow the money rather than being forced upward — a chart that cannot show a
loss is worthless in the months that matter.

## Schema

```ts
type PropertyModel = 'str' | 'ltr';     // absent ⇒ 'str'
Property.model?: PropertyModel

interface Lease {
  id: string;
  tenantName: string;
  monthlyRent: number;
  startDate: string;                    // YYYY-MM-DD
  endDate: string | null;               // null ⇒ month-to-month
  renewalNoticeDate?: string | null;    // the date worth warning about
  depositHeld?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface LeaseCharge {
  id: string;
  leaseId: string;
  label: string;                        // "Parking", "Late fee"
  amount: number;
  date: string;                         // first occurrence, or the day it applied
  recurring?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceEnd?: string | null;
  /** Fixed charges prorate with the lease; usage-based ones do not. */
  proratesWithLease?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Rent stays on the lease rather than becoming a charge: it is the headline, it
prorates against the lease's own dates, and a tenancy without rent is not a
tenancy. Charges are separate records so adding parking mid-tenancy does not mean
editing the lease, and so a late fee in March is not a property of the lease
itself.

`LeaseCharge` reuses `src/lib/recurrence.ts` — `occursInMonth` already answers
"does this land in this month" for monthly, quarterly and annual repeats, and a
one-off is a charge that is not recurring. The expense side proved that rule;
the revenue side should not grow a second one.

Storage follows bookings and expenses: `str:leases:<user>:<property>` and
`str:lease-charges:<user>:<property>`, scoped per property, hashed by id.

## Recognition

For a month `M`:

```
leaseDays   = days of M covered by [startDate, endDate]
rent        = monthlyRent × leaseDays / daysInMonth
charges     = Σ amount for each charge occurring in M
              × (proratesWithLease ? leaseDays / daysInMonth : 1)
leaseRevenue = rent + charges
```

Worked: $2,400/month from 20 March, $75 parking, in a 31-day March.
`leaseDays = 12`, `rent = 2400 × 12/31 = $929.03`, `parking = 75 × 12/31 =
$29.03`, `leaseRevenue = $958.06`.

Lease revenue joins `grossRevenue` and carries no platform fee or
platform-remitted tax — nobody takes a cut of rent — so it flows into net
revenue untouched. `PnLSummary` gains `leaseRevenue` so a mixed unit can be read
either way, and `MonthlyStatement` gains `leasedDays` for occupancy.

## Milestones

Two dates per lease, for the chart overlay:

- `renewalNoticeDate` — amber. The deadline to give or receive notice.
- `endDate` — red. The lease ends; the unit is vacant unless re-let.

They plot against the month they fall in. A short-term property has no leases, so
it has no dots — the conditional rendering the dashboard spec asks for falls out
of the data rather than needing a rule.

## Deferred

**Arrears.** Rent is recognised as due and assumed collected, matching how a
booking counts once the stay happened. `LeaseCharge` and the monthly recognition
leave room for a received amount per month, so arrears can be added later without
re-modelling — but until then a tenant who has not paid still shows as revenue,
which a cash flow dashboard should eventually not do.

**Concessions.** A free month or a discount is expressible today as a negative
charge. If that turns out to be common it deserves its own shape.

## Build order

1. Types, storage, recognition in `lib/lease.ts`, with tests on the proration
   arithmetic and the month boundaries.
2. `buildAnnualStatement` folds lease revenue and leased days in. Existing
   figures for a property with no leases must not move by a cent.
3. Lease CRUD API and a Leases page under the property in view.
4. `model` on the property, set during setup and shown as a badge.
5. The consolidated dashboard: STR/LTR filters, the shared stair-step canvas,
   milestone dots, tenant column.
