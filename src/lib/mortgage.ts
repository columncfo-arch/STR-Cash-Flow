// Splitting the mortgage payment into what it costs and what it buys.
//
// PITI is stored as one monthly figure and was subtracted whole, which makes the
// property look worse than it is: principal repayment is not an expense, it is
// cash moving from the owner's pocket into their equity. Interest, taxes and
// insurance are the real cost of carrying the property; principal is saving.
//
// Everything here is monthly and derived from the loan settings the Optimization
// page already collects.

import { Settings } from '@/types';

export interface PitiSplit {
  /** Mortgage interest — a genuine cost. */
  interest: number;
  /** Principal repayment — equity built, not an expense. */
  principal: number;
  /**
   * Everything in the payment the loan does not explain: property tax,
   * insurance, and any PMI, HOA or escrow folded into it. Genuine costs.
   */
  taxesInsurance: number;
  /** False when the loan details needed to separate interest from principal are missing. */
  derived: boolean;
}

/**
 * The principal-and-interest part of the monthly payment implied by the loan.
 *
 * Returns null when there is not enough to compute one. An interest-only loan
 * pays interest and nothing else, so its P&I is its interest.
 */
export function monthlyPrincipalAndInterest(settings: Settings | null): number | null {
  const balance = settings?.loanBalance ?? 0;
  const ratePct = settings?.mortgageRate ?? 0;
  if (balance <= 0) return null;

  const monthlyRate = ratePct / 100 / 12;
  if (settings?.loanStructure === 'interest_only') return balance * monthlyRate;

  const months = (settings?.loanTermYears ?? 0) * 12;
  if (months <= 0) return null;
  // A 0% loan is just the balance spread over the term
  if (monthlyRate === 0) return balance / months;

  const growth = Math.pow(1 + monthlyRate, months);
  return (balance * monthlyRate * growth) / (growth - 1);
}

/**
 * Split one month's PITI into interest, principal and taxes + insurance.
 *
 * The three parts always add up to the stored PITI, so the profit and loss still
 * balances however incomplete the loan settings are.
 *
 * Interest and principal are computed from the loan and trusted; whatever is
 * left over is escrow. The residual goes there rather than into principal on
 * purpose — principal is the figure this exists to make trustworthy, and a
 * payment that is larger than the loan explains usually means tax, insurance,
 * PMI or HOA riding along in it, not equity. Stated tax and insurance act as a
 * floor on that bucket, capping how much of the payment the loan may claim.
 *
 * The balance is treated as constant across the statement period. A year of
 * repayments moves it by a percent or two, so carrying a true amortisation
 * schedule through past months would be precision the stored snapshot does not
 * have.
 */
export function splitPiti(settings: Settings | null): PitiSplit {
  const piti = settings?.monthlyPITI ?? 0;
  if (piti <= 0) return { interest: 0, principal: 0, taxesInsurance: 0, derived: false };

  const stated = (settings?.monthlyPropertyTax ?? 0) + (settings?.monthlyInsurance ?? 0);
  const balance = settings?.loanBalance ?? 0;
  const ratePct = settings?.mortgageRate ?? 0;
  const canSplit = balance > 0 && ratePct > 0;

  if (!canSplit) {
    // Without a balance and a rate there is no way to tell interest from
    // principal. Report what is known rather than guessing a split.
    return {
      interest: 0,
      principal: 0,
      taxesInsurance: Math.min(stated, piti) || piti,
      derived: false,
    };
  }

  const taxesInsurance = Math.min(stated, piti);
  const forLoan = piti - taxesInsurance;

  const interest = Math.min(balance * (ratePct / 100 / 12), forLoan);
  const pAndI = monthlyPrincipalAndInterest(settings);
  const principal = pAndI == null
    ? Math.max(0, forLoan - interest)
    : Math.min(Math.max(0, pAndI - interest), forLoan - interest);

  return {
    interest,
    principal,
    // Whatever the loan does not account for is tax and insurance, so the three
    // parts still sum to the payment
    taxesInsurance: piti - interest - principal,
    derived: true,
  };
}

/**
 * The loan balance a given number of months from now, following the schedule the
 * current balance and rate imply. An interest-only loan never amortises, so its
 * balance does not move.
 */
export function balanceAfterMonths(settings: Settings | null, months: number): number {
  const balance = settings?.loanBalance ?? 0;
  if (balance <= 0) return 0;
  if (settings?.loanStructure === 'interest_only') return balance;

  const payment = monthlyPrincipalAndInterest(settings);
  if (payment == null || payment <= 0) return balance;

  const monthlyRate = (settings?.mortgageRate ?? 0) / 100 / 12;
  const projected = monthlyRate > 0
    ? balance * Math.pow(1 + monthlyRate, months) - payment * (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate
    : balance - payment * months;

  return Math.max(0, projected);
}
