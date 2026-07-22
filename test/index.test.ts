import { describe, expect, it } from 'vitest';

import { computeFreeSlots, type RecurringBusyBlock } from '../src/index';

function block(overrides: Partial<RecurringBusyBlock>): RecurringBusyBlock {
  return {
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    start: '00:00',
    end: '00:00',
    ...overrides,
  };
}

// Monday
const MONDAY = '2026-07-20';
// Sunday
const SUNDAY = '2026-07-19';
// Friday
const FRIDAY = '2026-07-24';
// Saturday
const SATURDAY = '2026-07-25';

describe('computeFreeSlots', () => {
  it('returns one all-day slot when there are no busy blocks', () => {
    expect(computeFreeSlots(MONDAY, [])).toEqual([{ start: '00:00', end: '23:59' }]);
  });

  it('splits the day around a single mid-day busy block', () => {
    const blocks = [block({ start: '09:00', end: '10:00' })];
    expect(computeFreeSlots(MONDAY, blocks)).toEqual([
      { start: '00:00', end: '09:00' },
      { start: '10:00', end: '23:59' },
    ]);
  });

  it('handles an overnight block that wraps past midnight', () => {
    const blocks = [block({ start: '23:00', end: '07:00' })];
    expect(computeFreeSlots(MONDAY, blocks)).toEqual([{ start: '07:00', end: '23:00' }]);
  });

  it('combines an overnight block with a mid-day block, matching a real daily schedule', () => {
    const blocks = [
      block({ start: '23:00', end: '07:00' }),
      block({ start: '09:00', end: '10:00', daysOfWeek: [1, 2, 3, 4, 5] }),
    ];
    expect(computeFreeSlots(MONDAY, blocks)).toEqual([
      { start: '07:00', end: '09:00' },
      { start: '10:00', end: '23:00' },
    ]);
  });

  it('excludes blocks not active on the given day of week', () => {
    const blocks = [
      block({ start: '23:00', end: '07:00' }),
      block({ start: '09:00', end: '10:00', daysOfWeek: [1, 2, 3, 4, 5] }),
    ];
    expect(computeFreeSlots(SUNDAY, blocks)).toEqual([{ start: '07:00', end: '23:00' }]);
  });

  it('does not produce a zero-length slot between back-to-back blocks', () => {
    const blocks = [
      block({ start: '09:00', end: '10:00' }),
      block({ start: '10:00', end: '11:00' }),
    ];
    expect(computeFreeSlots(MONDAY, blocks)).toEqual([
      { start: '00:00', end: '09:00' },
      { start: '11:00', end: '23:59' },
    ]);
  });

  it('merges overlapping busy blocks', () => {
    const blocks = [
      block({ start: '09:00', end: '11:00' }),
      block({ start: '10:00', end: '12:00' }),
    ];
    expect(computeFreeSlots(MONDAY, blocks)).toEqual([
      { start: '00:00', end: '09:00' },
      { start: '12:00', end: '23:59' },
    ]);
  });

  it('returns no slots when busy blocks cover the entire day', () => {
    const blocks = [
      block({ start: '20:00', end: '06:00' }),
      block({ start: '06:00', end: '20:00' }),
    ];
    expect(computeFreeSlots(MONDAY, blocks)).toEqual([]);
  });

  it('accepts a Date object as well as an ISO date string', () => {
    const blocks = [block({ start: '09:00', end: '10:00' })];
    const asDate = new Date(2026, 6, 20); // July 20 2026 (Monday), local time
    expect(computeFreeSlots(asDate, blocks)).toEqual(computeFreeSlots(MONDAY, blocks));
  });

  it('treats a zero-duration block (start === end) as no busy time, not as a full day', () => {
    const blocks = [block({ start: '09:00', end: '09:00' })];
    expect(computeFreeSlots(MONDAY, blocks)).toEqual([{ start: '00:00', end: '23:59' }]);
  });

  it('ignores a block whose daysOfWeek is empty on every day', () => {
    const blocks = [block({ start: '09:00', end: '17:00', daysOfWeek: [] })];
    expect(computeFreeSlots(MONDAY, blocks)).toEqual([{ start: '00:00', end: '23:59' }]);
  });

  it('reports a slot running to the end of the day as ending at 23:59, not 24:00', () => {
    const blocks = [block({ start: '00:00', end: '22:00' })];
    const slots = computeFreeSlots(MONDAY, blocks);
    expect(slots).toEqual([{ start: '22:00', end: '23:59' }]);
    expect(slots[0]!.end).not.toBe('24:00');
  });

  it('assigns a wrapping block scheduled on a single day to the correct two calendar days (the bartender shift)', () => {
    // A shift from 22:00 to 02:00, scheduled Fridays only. The 22:00-24:00
    // portion belongs to Friday; the 00:00-02:00 portion belongs to
    // Saturday, not Friday. A block scheduled on every day would hide this
    // distinction, so this test deliberately uses a single day.
    const blocks = [block({ start: '22:00', end: '02:00', daysOfWeek: [5] })];

    expect(computeFreeSlots(FRIDAY, blocks)).toEqual([{ start: '00:00', end: '22:00' }]);
    expect(computeFreeSlots(SATURDAY, blocks)).toEqual([{ start: '02:00', end: '23:59' }]);
  });
});
