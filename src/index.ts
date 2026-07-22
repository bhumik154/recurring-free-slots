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

/**
 * A block spanning midnight (e.g. 23:00-07:00) occupies two ranges within a
 * single day: the tail end of the day and the start of the next.
 *
 * A block where start equals end (e.g. "09:00" to "09:00") is treated as
 * zero-duration and contributes no busy time, not as a full 24-hour block.
 * If you mean "busy all day," express it as daysOfWeek + "00:00"-"23:59"
 * explicitly rather than relying on a start === end block.
 */
function toIntervals(startMinutes: number, endMinutes: number): Interval[] {
  if (startMinutes === endMinutes) return [];
  if (startMinutes < endMinutes) return [{ start: startMinutes, end: endMinutes }];
  return [
    { start: 0, end: endMinutes },
    { start: startMinutes, end: MINUTES_PER_DAY },
  ];
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
 * e.g. a sleep block from 23:00 to 07:00) are handled correctly: the portion
 * before midnight counts toward the block's own day, and the portion after
 * midnight counts toward the following day.
 *
 * Overlapping and back-to-back busy blocks are merged; zero-length gaps are
 * never produced.
 */
export function computeFreeSlots(date: string | Date, busyBlocks: RecurringBusyBlock[]): Slot[] {
  const today = resolveDayOfWeek(date);
  const occupied = mergeIntervals(
    busyBlocks
      .filter((block) => block.daysOfWeek.includes(today))
      .flatMap((block) => toIntervals(timeToMinutes(block.start), timeToMinutes(block.end))),
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
