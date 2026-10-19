export type Platform = 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'other';

export type LoanStructure = 'fixed' | 'arm' | 'interest_only';

export type ExpenseCategory = 'cleaning' | 'electric' | 'water' | 'internet' | 'yard_care' | 'supplies' | 'refund' | 'maintenance' | 'other';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'electric', label: 'Electric' },
  { value: 'water', label: 'Water' },
  { value: 'internet', label: 'Internet' },
  { value: 'yard_care', label: 'Yard Care' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'refund', label: 'Guest Refund' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
];

export interface Booking {
  id: string;
  sourceId: string;
  platform: Platform;
  uid: string;
  summary: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  nights: number;
  guestName?: string;
  email?: string;
  confirmationCode?: string;
  income: number;         // gross earnings
  platformFee?: number;   // service fee / host fee
  paidOut?: number;       // net payout received
  // Airbnb-specific fee fields
  fastPayFee?: number;
  cleaningFee?: number;
  petFee?: number;
  taxRemitted?: number;   // platform-remitted tax
  amount?: number;        // raw "Amount" column
  // Booking metadata
  payoutDate?: string;
  bookingDate?: string;
  arrivingByDate?: string;
  listing?: string;
  details?: string;
  referenceCode?: string;
  currency?: string;
  earningsYear?: number;
  // Booking.com fields
  commissionPct?: number;
  paymentStatus?: string;
  paymentMethod?: string;
  bookerName?: string;
  bookerCountry?: string;
  travelPurpose?: string;
  device?: string;
  unitType?: string;
  cancellationDate?: string;
  address?: string;
  phone?: string;
  adults?: number;
  children?: number;
  childrenAges?: string;
  rooms?: number;
  people?: number;
  // VRBO fields
  propertyId?: string;
  unitId?: string;
  lodgingTaxOwnerRemits?: number;
  taxWithheld?: number;
  status?: string;
  isManual?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * How a unit is let. A label, not a switch: a property's revenue is its
 * bookings plus its leases either way, and nothing in the accounting branches
 * on it. A unit let nightly for half a year and leased for the rest reports
 * both with no special case, which is exactly what converting one looks like.
 *
 * Absent on every property saved before long lets existed, all of which were
 * short-term — so absent reads as 'str'.
 */
export type PropertyModel = 'str' | 'ltr';

/**
 * One rental unit. Everything financial — bookings, expenses, leases, targets,
 * the loan — belongs to a property rather than to the account, so an owner with
 * three units keeps three separate sets of books under one login.
 */
export interface Property {
  id: string;
  name: string;
  createdAt: string;
  /** Hidden from the portfolio without deleting its history. */
  archived?: boolean;
  /** The platform's own id for this unit, used to route synced reservations. */
  externalIds?: string[];
  /** How it is let. Absent ⇒ 'str'. */
  model?: PropertyModel;
}

/**
 * What belongs to the login rather than to any one unit: the list of
 * properties, which one is in view, and the credentials that reach every unit
 * at once.
 */
export interface Account {
  properties: Property[];
  activePropertyId: string;
  currency: string;
  hostexAccessToken?: string;
  /** Set once the legacy single-property records have been copied across. */
  migratedAt?: string;
}

export type RecurrenceFrequency = 'monthly' | 'quarterly' | 'annual';

/**
 * A tenancy. Rent is the headline and lives here rather than becoming a charge:
 * it prorates against the lease's own dates, and a tenancy without rent is not
 * a tenancy.
 */
export interface Lease {
  id: string;
  tenantName: string;
  monthlyRent: number;
  startDate: string;                    // YYYY-MM-DD
  /** null ⇒ month-to-month, running until it is ended. */
  endDate: string | null;
  /**
   * Actual move-out, when a tenant left before `endDate`. Rent stops here.
   * Both dates are kept: "contracted to December and ended in August" and
   * "always an August lease" are different facts, and only the first one
   * explains the vacancy that follows.
   */
  terminatedOn?: string | null;
  /** The date notice has to be given or received by, for the warning. */
  renewalNoticeDate?: string | null;
  /** Escrowed, never revenue. Owed back unless withheld at move-out. */
  depositHeld?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Anything billed alongside the rent: parking and pet rent monthly, a late fee
 * or an early termination fee on the day it applied. Separate records so adding
 * parking mid-tenancy does not mean editing the lease, and so a late fee in
 * March is not a property of the lease itself.
 */
export interface LeaseCharge {
  id: string;
  leaseId: string;
  label: string;                        // "Parking", "Late fee"
  amount: number;
  /** First occurrence, or the day a one-off applied. */
  date: string;
  recurring?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceEnd?: string | null;
  /** A fixed charge prorates with the lease; a one-off event does not. */
  proratesWithLease?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  date: string;          // YYYY-MM-DD, first occurrence for recurring expenses
  category: ExpenseCategory;
  subcategory?: string;  // for utilities: Electric, Water, etc.
  description: string;
  amount: number;
  bookingId?: string;    // optional link to a specific booking
  recurring?: boolean;       // repeats from `date` at recurrenceFrequency
  // How often it repeats. Absent on records saved before frequencies existed,
  // which were all monthly — so absent means monthly.
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceEnd?: string | null; // YYYY-MM-DD, optional last month it applies to
  createdAt: string;
  updatedAt: string;
}

export interface ForecastOverride {
  revenue?: number;
  expenses?: number;
  piti?: number;
  isManualYear?: boolean;
  expenseDetail?: Record<string, number>; // category key → amount (platformFees, cleaning, electric…)
  monthlyRevenue?: number[]; // 12 monthly gross revenue figures (Jan–Dec) for seasonality distribution
}

export interface Settings {
  currency: string;
  propertyName: string;
  monthlyPITI: number;
  cleaningFeePerBooking: number;
  forecastGrowthPct: number;                      // default YoY growth if no year-specific rate set
  forecastGrowthByYear: Record<string, number>;    // year string → growth %, e.g. {"2026": 4, "2027": 3}
  vacancyRate: number;                             // % of gross revenue lost to vacancy/unbooked nights
  forecastOverrides: Record<string, ForecastOverride>; // year string → manual overrides
  benchmarkAdr?: number;
  benchmarkExpenseRatio?: number;
  benchmarkCleaningFee?: number;  // sub-market cleaning fee per stay
  guestCleaningFeePerBooking?: number; // cleaning fee charged to guests (not an expense)
  yourAdr?: number;              // user-overridden ADR for optimization display
  targetOccupancyPct?: number;   // dashboard occupancy goal (%)
  targetAdr?: number;            // dashboard ADR goal ($)
  sensitivityAdr?: number;       // sensitivity model assumption overrides
  sensitivityAvgStay?: number;
  sensitivityCleaningFee?: number;
  sensitivityCleaningCost?: number;
  sensitivityOpEx?: number;
  sensitivityTarget1?: number;
  sensitivityTarget2?: number;
  sensitivityTarget3?: number;
  platformFeeRate?: number;      // forward-looking platform fee rate override (e.g. 0.15 for Airbnb host-only model)
  totalCapitalDeployed?: number;
  benchmarkReturnPct?: number;  // annualised return the property is judged against (e.g. 8 for an index fund)
  renovationCosts?: number;
  monthlyPropertyTax?: number;    // the T in PITI, per month
  monthlyInsurance?: number;      // the second I in PITI, per month
  mortgageRate?: number;          // current interest rate %
  propertyValue?: number;         // estimated current value
  loanBalance?: number;           // current outstanding balance
  propertyAppreciationPct?: number; // annual property value appreciation %
  loanOriginalBalance?: number;   // original loan amount (for amortization)
  loanTermYears?: number;         // loan term in years (for amortization)
  loanStructure?: LoanStructure;  // fixed / ARM / interest-only
  // Guest welcome / in-stay capture
  wifiNetwork?: string;
  wifiPassword?: string;
  welcomeMessage?: string;
  localGuideUrl?: string;
  // Direct booking site
  airbnbIcalUrl?: string;
  vrboIcalUrl?: string;
  directNightlyRate?: number;
  directMinNights?: number;
  directDescription?: string;
  // API integrations
  hostexAccessToken?: string;
}

export interface ForecastYear {
  year: number;
  type: 'actual' | 'partial' | 'forecast';
  grossRevenue: number;
  platformFees: number;      // platform service fees + fast pay + tax remitted (separate from operatingExpenses)
  operatingExpenses: number; // cleaning + manual expenses + owner-remitted taxes (excludes platform fees)
  piti: number;
  netIncome: number;
  growthPct: number | null;
  isManualRevenue: boolean;
  isManualExpenses: boolean;
  isManualPiti: boolean;
  isManualEntry: boolean;
  blended: boolean;          // current year: true = actuals + remainder forecast
  /** Nights sold in the year, where it has any. Forecast years project revenue
   *  but not the nights behind it, so they carry none. */
  totalNights?: number;
  ytdGross?: number;         // breakdown: actual portion
  ytdPlatformFees?: number;
  ytdOpEx?: number;
  forecastGross?: number;    // breakdown: projected remainder
  forecastPlatformFees?: number;
  forecastOpEx?: number;
}

export interface PnLSummary {
  grossRevenue: number;
  /**
   * The part of gross revenue that came from leases rather than stays, so a
   * unit let both ways can be read either way. It carries no platform fee and
   * no platform-remitted tax — nobody takes a cut of rent — so it flows into
   * net revenue untouched.
   */
  leaseRevenue: number;
  platformFees: number;      // host service fee / commission
  fastPayFees: number;       // instant payout fees (Airbnb)
  taxRemitted: number;       // platform-remitted occupancy tax
  refunds: number;
  netRevenue: number;
  expensesByCategory: Record<ExpenseCategory, number>;
  ownerTaxes: number;        // lodging tax owner must remit directly (VRBO)
  totalOperatingExpenses: number;
  operatingIncome: number;
  piti: number;
  // PITI split three ways. Interest, tax and insurance are costs; principal is
  // equity built. The three always sum to `piti`.
  mortgageInterest: number;
  mortgagePrincipal: number;
  mortgageTaxesInsurance: number;
  /** Profit after the costs of carrying the property, before principal repayment. */
  netProfit: number;
  /** What actually leaves the bank: netProfit less the principal repaid. */
  netIncome: number;
}

export interface MonthlyStatement extends PnLSummary {
  year: number;
  month: number;
  bookings: Booking[];
  totalNights: number;
  /** Days of the month covered by a lease. Occupancy counts these alongside
   *  nights sold, so a leased unit reads near 100% and a turnover month reads
   *  the part of it that was covered. */
  leasedDays: number;
  occupancyRate: number;
  byPlatform: Record<Platform, { income: number; nights: number; bookings: number }>;
}

export interface DirectLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  preferredDates?: string;
  tcpaConsent: boolean;
  source: 'direct_booking' | 'welcome';
  /**
   * The unit whose welcome code or booking form this came through. Absent on
   * leads captured before properties existed, which cannot be attributed to one
   * — so the roster shows them whichever unit is in view rather than hiding
   * them from all of them.
   */
  propertyId?: string;
  createdAt: string;
}

export interface AnnualStatement extends PnLSummary {
  year: number;
  months: MonthlyStatement[];
  totalNights: number;
  leasedDays: number;
  avgOccupancyRate: number;
  byPlatform: Record<Platform, { income: number; nights: number; bookings: number }>;
}
