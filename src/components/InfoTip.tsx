'use client';
import { useState } from 'react';
import { Info } from 'lucide-react';

/**
 * A short explanation, kept out of the way until asked for.
 *
 * These notes used to sit as a line of prose under the figure or chart they
 * described, which read as clutter once the page was familiar — the explanation
 * was permanent while the need for it was not.
 *
 * Click rather than hover, because hover does not exist on a phone.
 */
export default function InfoTip({
  label = 'What this means',
  align = 'left',
  children,
}: {
  label?: string;
  /** Which edge the bubble hangs from — use `right` near the edge of a card. */
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setOpen(false)}
        aria-label={label}
        aria-expanded={open}
        className="text-slate-300 hover:text-slate-500 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-20 top-5 w-56 max-w-[calc(100vw-3rem)] rounded-lg bg-slate-900 px-3 py-2
            text-[11px] font-normal normal-case tracking-normal leading-relaxed text-slate-100 shadow-lg
            ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
