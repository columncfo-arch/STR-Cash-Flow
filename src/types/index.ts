export type Platform = 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'other';

export interface ICalSource {
  id: string;
  platform: Platform;
  name: string;
  url: string;
  enabled: boolean;
  lastSynced?: string;
}

export interface Booking {
  id: string;
  sourceId: string;
  platform: Platform;
  uid: string;
  summary: string;
  checkIn: string;   // ISO date string
  checkOut: string;  // ISO date string
  nights: number;
  guestName?: string;
  confirmationCode?: string;
  income: number;      // Total income for this booking
  isManual?: boolean;  // true if income was manually entered
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  sources: ICalSource[];
  defaultNightlyRate: number;
  currency: string;
  propertyName: string;
}

export interface MonthlyStatement {
  year: number;
  month: number;
  bookings: Booking[];
  totalIncome: number;
  totalNights: number;
  occupancyRate: number;
  byPlatform: Record<Platform, { income: number; nights: number; bookings: number }>;
}

export interface AnnualStatement {
  year: number;
  months: MonthlyStatement[];
  totalIncome: number;
  totalNights: number;
  avgOccupancyRate: number;
  byPlatform: Record<Platform, { income: number; nights: number; bookings: number }>;
}
