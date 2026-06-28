export type Platform = 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'other';

export type ExpenseCategory = 'utilities' | 'cleaning' | 'supplies' | 'maintenance' | 'refund' | 'other';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'utilities', label: 'Utilities' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'maintenance', label: 'Maintenance / Repairs' },
  { value: 'refund', label: 'Guest Refund' },
  { value: 'other', label: 'Other' },
];

export const UTILITY_SUBCATEGORIES = ['Electric', 'Water', 'Internet', 'Lawn Care', 'Other'];

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
  payoutDate?: string;    // date payout was processed
  bookingDate?: string;   // date booking was made
  arrivingByDate?: string;
  listing?: string;
  details?: string;
  referenceCode?: string;
  currency?: string;
  earningsYear?: number;
  isManual?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  date: string;          // YYYY-MM-DD
  category: ExpenseCategory;
  subcategory?: string;  // for utilities: Electric, Water, etc.
  description: string;
  amount: number;
  bookingId?: string;    // optional link to a specific booking
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  currency: string;
  propertyName: string;
  monthlyPITI: number;
}

export interface PnLSummary {
  grossRevenue: number;
  platformFees: number;    // host service fee / commission
  fastPayFees: number;     // instant payout fees
  taxRemitted: number;     // platform-remitted occupancy tax (informational)
  refunds: number;
  netRevenue: number;
  expensesByCategory: Record<ExpenseCategory, number>;
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
