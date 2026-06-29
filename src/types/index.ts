export type Platform = 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'other';

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

export interface Expense {
  id: string;
  date: string;          // YYYY-MM-DD, first occurrence for recurring expenses
  category: ExpenseCategory;
  subcategory?: string;  // for utilities: Electric, Water, etc.
  description: string;
  amount: number;
  bookingId?: string;    // optional link to a specific booking
  recurring?: boolean;       // repeats monthly starting at `date`
  recurrenceEnd?: string | null; // YYYY-MM-DD, optional last month it applies to
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  currency: string;
  propertyName: string;
  monthlyPITI: number;
  cleaningFeePerBooking: number;
  forecastGrowthPct: number;                      // default YoY growth if no year-specific rate set
  forecastGrowthByYear: Record<string, number>;    // year string → growth %, e.g. {"2026": 4, "2027": 3}
}

export interface PnLSummary {
  grossRevenue: number;
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
  netIncome: number;
}

export interface MonthlyStatement extends PnLSummary {
  year: number;
  month: number;
  bookings: Booking[];
  totalNights: number;
  occupancyRate: number;
  byPlatform: Record<Platform, { income: number; nights: number; bookings: number }>;
}

export interface AnnualStatement extends PnLSummary {
  year: number;
  months: MonthlyStatement[];
  totalNights: number;
  avgOccupancyRate: number;
  byPlatform: Record<Platform, { income: number; nights: number; bookings: number }>;
}
