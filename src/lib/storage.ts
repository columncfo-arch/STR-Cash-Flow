import fs from 'fs';
import path from 'path';
import { Booking, Settings } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadSettings(): Settings {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaults: Settings = {
      sources: [],
      defaultNightlyRate: 0,
      currency: 'USD',
      propertyName: 'My STR Property',
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
}

export function saveSettings(settings: Settings): void {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export function loadBookings(): Booking[] {
  ensureDataDir();
  if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf-8'));
}

export function saveBookings(bookings: Booking[]): void {
  ensureDataDir();
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

export function upsertBooking(booking: Booking): void {
  const bookings = loadBookings();
  const idx = bookings.findIndex(b => b.uid === booking.uid && b.sourceId === booking.sourceId);
  if (idx >= 0) {
    // Preserve manual income if already set
    const existing = bookings[idx];
    bookings[idx] = {
      ...booking,
      income: existing.isManual ? existing.income : booking.income,
      isManual: existing.isManual,
      notes: existing.notes ?? booking.notes,
    };
  } else {
    bookings.push(booking);
  }
  saveBookings(bookings);
}
