/**
 * Triarch Dev Theme Provider
 *
 * Reusable theme system with holiday overrides and company color schemes.
 * Extracted from the TMI theme system for cross-project use.
 *
 * Usage:
 *   <ThemeProvider companyColors={{ primary: '#ff0000' }}>
 *     <App />
 *   </ThemeProvider>
 *
 * CSS variables are applied as --theme-primary, --theme-secondary, etc.
 */
'use client';

import React, { useMemo, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  [key: string]: string;
}

export interface HolidayTheme {
  name: string;
  /** MM-DD format, inclusive */
  startDate: string;
  /** MM-DD format, inclusive */
  endDate: string;
  colors: Partial<ColorScheme>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COLORS: ColorScheme = {
  primary: '#14b8a6',    // teal-500
  secondary: '#3b82f6',  // blue-500
  accent: '#f59e0b',     // amber-500
  background: '#09090b', // zinc-950
  text: '#fafafa',       // zinc-50
};

/**
 * Built-in holiday themes. Projects can override or extend via the
 * `holidayThemes` prop on ThemeProvider.
 */
const BUILT_IN_HOLIDAYS: HolidayTheme[] = [
  {
    name: 'Valentine\'s Day',
    startDate: '02-12',
    endDate: '02-14',
    colors: { primary: '#e11d48', secondary: '#f43f5e', accent: '#fb7185' },
  },
  {
    name: 'St. Patrick\'s Day',
    startDate: '03-15',
    endDate: '03-17',
    colors: { primary: '#16a34a', secondary: '#22c55e', accent: '#4ade80' },
  },
  {
    name: 'Independence Day',
    startDate: '07-02',
    endDate: '07-04',
    colors: { primary: '#dc2626', secondary: '#2563eb', accent: '#fafafa' },
  },
  {
    name: 'Halloween',
    startDate: '10-25',
    endDate: '10-31',
    colors: { primary: '#f97316', secondary: '#7c3aed', accent: '#22c55e' },
  },
  {
    name: 'Christmas',
    startDate: '12-20',
    endDate: '12-25',
    colors: { primary: '#dc2626', secondary: '#16a34a', accent: '#fbbf24' },
  },
  {
    name: 'New Year\'s Eve',
    startDate: '12-30',
    endDate: '12-31',
    colors: { primary: '#eab308', secondary: '#a855f7', accent: '#fafafa' },
  },
];

// ---------------------------------------------------------------------------
// Pure helpers (exported for direct use outside React)
// ---------------------------------------------------------------------------

/**
 * Return the active holiday theme for a given date (defaults to now).
 */
export function getActiveHoliday(
  holidays: HolidayTheme[] = BUILT_IN_HOLIDAYS,
  date: Date = new Date(),
): HolidayTheme | null {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return holidays.find((h) => mmdd >= h.startDate && mmdd <= h.endDate) ?? null;
}

/** Strip undefined values so spreading into ColorScheme stays type-safe. */
function filterUndefined(obj: Partial<ColorScheme>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Resolve the final color scheme by layering: default < holiday < company.
 */
export function getUserTheme(options?: {
  companyColors?: Partial<ColorScheme>;
  holidayThemes?: HolidayTheme[];
  date?: Date;
}): { colors: ColorScheme; source: 'default' | 'holiday' | 'company'; holidayName?: string } {
  const { companyColors, holidayThemes = BUILT_IN_HOLIDAYS, date } = options ?? {};

  let colors: ColorScheme = { ...DEFAULT_COLORS };
  let source: 'default' | 'holiday' | 'company' = 'default';
  let holidayName: string | undefined;

  // Layer 1: Holiday
  const holiday = getActiveHoliday(holidayThemes, date);
  if (holiday) {
    colors = { ...colors, ...filterUndefined(holiday.colors) };
    source = 'holiday';
    holidayName = holiday.name;
  }

  // Layer 2: Company (overrides holiday)
  if (companyColors && Object.keys(companyColors).length > 0) {
    colors = { ...colors, ...filterUndefined(companyColors) };
    source = 'company';
  }

  return { colors, source, holidayName };
}

/**
 * Convert a ColorScheme into a CSS variable string.
 * Each key becomes `--theme-<key>: <value>;`
 */
export function themeToCssVars(colors: ColorScheme): string {
  return Object.entries(colors)
    .map(([key, value]) => `--theme-${key}: ${value};`)
    .join('\n  ');
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  children: ReactNode;
  /** Company-specific color overrides. */
  companyColors?: Partial<ColorScheme>;
  /** Custom holiday themes; merged with (or replaces) built-ins. */
  holidayThemes?: HolidayTheme[];
  /** If true, replaces built-in holidays instead of merging. */
  replaceBuiltInHolidays?: boolean;
  /** Override the "current date" for testing. */
  date?: Date;
  /** Additional inline styles on the wrapper div. */
  style?: React.CSSProperties;
  /** Additional className on the wrapper div. */
  className?: string;
}

export function ThemeProvider({
  children,
  companyColors,
  holidayThemes: customHolidays,
  replaceBuiltInHolidays = false,
  date,
  style,
  className,
}: ThemeProviderProps) {
  const holidays = useMemo(() => {
    if (!customHolidays) return BUILT_IN_HOLIDAYS;
    return replaceBuiltInHolidays ? customHolidays : [...BUILT_IN_HOLIDAYS, ...customHolidays];
  }, [customHolidays, replaceBuiltInHolidays]);

  const { colors } = useMemo(
    () => getUserTheme({ companyColors, holidayThemes: holidays, date }),
    [companyColors, holidays, date],
  );

  const cssVarsStyle = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(colors)) {
      vars[`--theme-${key}`] = value;
    }
    return vars;
  }, [colors]);

  return (
    <div style={{ ...cssVarsStyle, ...style } as React.CSSProperties} className={className}>
      {children}
    </div>
  );
}
