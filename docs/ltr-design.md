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

**A lease can end before it was meant to.** A tenant may buy their way out: a
fee, and a move-out date earlier than the contracted end. Both facts are kept —
the date the lease was written to run to, and the date the tenant actually left
— because "this was contracted to December and ended in August" and "this was
always an August lease" are different facts, and only the first one explains the
vacancy that follows.

**Rent paid ahead is still rent.** It is recognised across the months it covers,
not the month the money arrived — the same rule a booking follows, counting on
the stay rather than the payout. A tenant paying twelve months up front would
otherwise show one enormous January and eleven failures, and every pacing figure
on the dashboard would be wrong in both directions. First and last month up
front needs nothing new: the last month's rent is recognised in the last month.
What early payment changes is when the cash arrived, which is the payments
ledger below, not what was earned.

**A security deposit is not revenue.** It is money held on behalf of the tenant
and owed back, so it enters no line of the profit and loss. It does sit in the
bank account, which is the danger: the balance overstates what is actually the
owner's by the sum of deposits held, and the app should say so rather than let
it read as cash available.

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
  /** Actual move-out, when a tenant left before endDate. Rent stops here. */
  terminatedOn?: string | null;
  renewalNoticeDate?: string | null;    // the date worth warning about
  /** Escrowed, never revenue. Owed back unless withheld at move-out. */
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

An early termination fee is a `LeaseCharge` dated the move-out, not a field on
the lease. It then needs no recognition code of its own, and the cases where a
tenancy ends early without a fee — a mutual agreement, a military clause, a
buy-out waived — are the ordinary ones rather than a null to work around. The
lease carries the date; the charge carries the money. The UI should offer to
create the charge when a termination is recorded, so the two are entered
together even though they are stored apart.

Storage follows bookings and expenses: `str:leases:<user>:<property>` and
`str:lease-charges:<user>:<property>`, scoped per property, hashed by id.

## Recognition

The lease's effective end is the earlier of its contracted end and its actual
move-out, so terminating one is a single field and the arithmetic below does not
change. For a month `M`:

```
effectiveEnd = earliest of (endDate, terminatedOn)
leaseDays   = days of M covered by [startDate, effectiveEnd]
rent        = monthlyRent × leaseDays / daysInMonth
charges     = Σ amount for each charge occurring in M
              × (proratesWithLease ? leaseDays / daysInMonth : 1)
leaseRevenue = rent + charges
```

Worked: $2,400/month from 20 March, $75 parking, in a 31-day March.
`leaseDays = 12`, `rent = 2400 × 12/31 = $929.03`, `parking = 75 × 12/31 =
$29.03`, `leaseRevenue = $958.06`.

Worked, terminated early: the same lease runs to 31 December, the tenant leaves
on 15 August and pays a $2,400 termination fee. August has `leaseDays = 15`, so
`rent = $1,161.29` and `parking = $36.29`; the fee lands whole, being a one-off
charge rather than a monthly one. August recognises `$3,597.58`. September
onward recognises nothing and reads as vacant, which is the point — the fee
softens the month the tenant left, and the hole it leaves is still visible in
every month after it.

Lease revenue joins `grossRevenue` and carries no platform fee or
platform-remitted tax — nobody takes a cut of rent — so it flows into net
revenue untouched. `PnLSummary` gains `leaseRevenue` so a mixed unit can be read
either way, and `MonthlyStatement` gains `leasedDays` for occupancy.

## Deposits

`depositHeld` is excluded from every figure in the profit and loss — gross
revenue, net revenue, NOI and cash flow alike. It is reported on its own, beside
the lease and summed across the portfolio, labelled as held rather than earned.

At move-out the deposit resolves one of two ways, and both are ordinary records
rather than new machinery:

- **Returned.** It stops being held. Nothing touches the profit and loss,
  because nothing was ever earned.
- **Withheld, in whole or part.** The withheld amount becomes a `LeaseCharge`
  dated the move-out: at that point it stops being the tenant's money and starts
  being the owner's. The repair it paid for is an ordinary operating expense.

Keeping those two separate matters. Netting a $600 withholding against a $900
repair would show a $300 cost and hide both the income and the damage; recorded
apart, the ledger shows $600 earned and $900 spent, which is what happened.

## Milestones

Two dates per lease, for the chart overlay:

- `renewalNoticeDate` — amber. The deadline to give or receive notice. Drops
  out once `terminatedOn` is set: nobody is renewing a tenancy that has ended.
- effective end — red. The lease ends and the unit is vacant unless re-let. On a
  terminated lease this is the actual move-out, not the contracted end, because
  that is when the unit really empties. The tooltip should say it ended early and
  name the date it was written to run to.

They plot against the month they fall in. A short-term property has no leases, so
it has no dots — the conditional rendering the dashboard spec asks for falls out
of the data rather than needing a rule.

## Deferred

**The payments ledger.** Rent is recognised as due and assumed collected,
matching how a booking counts once the stay happened. This is the one place the
model knowingly diverges from the bank: a tenant three months behind still shows
as revenue, and a tenant who paid the year up front shows nothing extra in
January. Both are right for measuring what the property earned and wrong for
knowing what landed.

Recording receipts — date and amount against a lease — would answer both at once,
and would also let a deposit be tracked from the day it arrived to the day it was
returned. The schema leaves room for it; until it exists, arrears and
prepayments are invisible.

**Concessions.** A free month or a discount is expressible today as a negative
charge. If that turns out to be common it deserves its own shape.

**Re-letting.** A unit relet after an early termination is a second lease
starting the day the next tenant moves in. Nothing connects the two, which is
right for the books and wrong for asking how long the unit sat empty — that
question wants the gap between one lease's effective end and the next one's
start, and is worth answering once there are enough leases for it to matter.

## Build order

1. Types, storage, recognition in `lib/lease.ts`, with tests on the proration
   arithmetic, the month boundaries, an early termination cutting a lease short
   mid-month, and a deposit never reaching a revenue line.
2. `buildAnnualStatement` folds lease revenue and leased days in. Existing
   figures for a property with no leases must not move by a cent.
3. Lease CRUD API and a Leases page under the property in view.
4. `model` on the property, set during setup and shown as a badge.
5. The consolidated dashboard: STR/LTR filters, the shared stair-step canvas,
   milestone dots, tenant column.
