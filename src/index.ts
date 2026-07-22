export interface RecurringBusyBlock {
  /** 0 = Sunday ... 6 = Saturday */
  daysOfWeek: number[];
  /** "HH:MM", 24-hour */
  start: string;
  /** "HH:MM", 24-hour. If <= start, the block wraps past midnight. */
  end: string;
}

export interface Slot {
  start: string;
  end: string;
}

const MINUTES_PER_DAY = 24 * 60;

export function timeToMinutes(time: string): number {
  const [hoursPart, minutesPart] = time.split(':');
  return Number(hoursPart) * 60 + Number(minutesPart ?? 0);
}

/**
 * Minutes are clamped to "23:59" at the day boundary rather than emitted as
 * "24:00" (not a valid HH:MM time) or wrapped to "00:00" (which would make a
 * slot that runs to the end of the day look zero-length to a naive caller).
 *
 * This is a deliberately lossy representation at the boundary: feeding the
 * result back through timeToMinutes("23:59") gives 1439, not 1440. A slot
 * that runs to the true end of the day is therefore reported as ending one
 * minute early rather than at an invalid or ambiguous time string.
 */
export function minutesToTime(minutes: number): string {
  if (minutes >= MINUTES_PER_DAY) return '23:59';
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

function resolveDayOfWeek(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date;
  return d.getDay();
}

interface Interval {
  start: number;
  end: number;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/**
 * Computes the free (non-busy) time slots for a given date, given a list of
 * recurring weekly busy blocks. Blocks that wrap past midnight (end <= start,
 * e.g. a bartender's shift from 22:00 to 02:00) are handled per-day, not by
 * splitting the block into two pieces on the same day: a wrapping block
 * scheduled on day D contributes its pre-midnight portion to day D and its
 * post-midnight portion to day D+1, so a block scheduled on Friday only
 * correctly blocks Saturday morning, not Friday morning.
 *
 * A block where start equals end (e.g. "09:00" to "09:00") is treated as
 * zero-duration and contributes no busy time, not as a full 24-hour block.
 * If you mean "busy all day," express it as daysOfWeek + "00:00"-"23:59"
 * explicitly rather than relying on a start === end block.
 *
 * Overlapping and back-to-back busy blocks are merged; zero-length gaps are
 * never produced.
 */
export function computeFreeSlots(date: string | Date, busyBlocks: RecurringBusyBlock[]): Slot[] {
  const today = resolveDayOfWeek(date);
  const yesterday = (today + 6) % 7;

  const occupied = mergeIntervals(
    busyBlocks.flatMap((block): Interval[] => {
      const startMinutes = timeToMinutes(block.start);
      const endMinutes = timeToMinutes(block.end);
      if (startMinutes === endMinutes) return [];

      const wraps = startMinutes > endMinutes;
      const intervals: Interval[] = [];

      // This block's own portion on today, if it's scheduled today.
      if (block.daysOfWeek.includes(today)) {
        intervals.push({ start: startMinutes, end: wraps ? MINUTES_PER_DAY : endMinutes });
      }

      // A wrapping block scheduled yesterday spills its post-midnight
      // portion into today, regardless of whether the block also runs today.
      if (wraps && block.daysOfWeek.includes(yesterday)) {
        intervals.push({ start: 0, end: endMinutes });
      }

      return intervals;
    }),
  );

  const slots: Slot[] = [];
  let cursor = 0;
  for (const interval of occupied) {
    if (interval.start > cursor) {
      slots.push({ start: minutesToTime(cursor), end: minutesToTime(interval.start) });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < MINUTES_PER_DAY) {
    slots.push({ start: minutesToTime(cursor), end: minutesToTime(MINUTES_PER_DAY) });
  }
  return slots;
}
