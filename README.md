# recurring-free-slots

A pure function that computes a day's free time slots from recurring weekly busy blocks, correctly handling the case that breaks almost every hand-rolled version: a block that spans midnight.

## The problem

If you've ever computed availability from a list of recurring blocks (classes, shifts, sleep, meetings), you've probably hit this: a block like "Sleep, 23:00 to 07:00" doesn't fit the simple `start < end` assumption most interval code makes. The naive version looks like this:

```ts
// Naive: assumes start < end. Silently wrong for anything that wraps midnight.
function isBusy(block, minutes) {
  return minutes >= toMinutes(block.start) && minutes < toMinutes(block.end);
}
```

For a 23:00-07:00 block, `toMinutes(block.start)` is `1380` and `toMinutes(block.end)` is `420`. The condition `minutes >= 1380 && minutes < 420` is never true for any value of `minutes`, so the block silently vanishes: the "free slot" calculation reports someone as available while they're asleep. This is a correctness bug, not a style nitpick, and it only shows up for the specific blocks (overnight shifts, sleep, anything crossing midnight) that matter most to get right.

`computeFreeSlots` fixes this by treating a wrapping block as two pieces that belong to two different calendar days: the portion before midnight counts toward the day the block is scheduled on, and the portion after midnight counts toward the next day. That distinction only matters once a wrapping block isn't scheduled every day: a shift from 22:00 to 02:00 on Fridays only has to block Friday night and Saturday morning, not Friday morning, or you'll block off a slot that was never actually busy.

## Tested against exactly the cases that break naive implementations

Not "should work", tested. [`test/index.test.ts`](test/index.test.ts) has 15 cases, each asserting exact input/output with no mocks:

```ts
it('handles an overnight block that wraps past midnight', () => {
  const blocks = [block({ start: '23:00', end: '07:00' })];
  expect(computeFreeSlots(MONDAY, blocks)).toEqual([{ start: '07:00', end: '23:00' }]);
});

it('assigns a wrapping block scheduled on a single day to the correct two calendar days (the bartender shift)', () => {
  // A shift from 22:00 to 02:00, scheduled Fridays only. The 22:00-24:00
  // portion belongs to Friday; the 00:00-02:00 portion belongs to
  // Saturday, not Friday.
  const blocks = [block({ start: '22:00', end: '02:00', daysOfWeek: [5] })];

  expect(computeFreeSlots(FRIDAY, blocks)).toEqual([{ start: '00:00', end: '22:00' }]);
  expect(computeFreeSlots(SATURDAY, blocks)).toEqual([{ start: '02:00', end: '23:59' }]);
});
```

The full list of scenarios covered:

| Scenario | Why it's there |
|---|---|
| No busy blocks | Baseline: the whole day is free |
| Single mid-day block | Baseline interval splitting |
| Overnight block wrapping past midnight | The core bug this package exists for |
| Overnight block combined with a mid-day block | The actual shape of a real daily schedule |
| Wrapping block scheduled on a single day, not every day | Proves the pre/post-midnight halves land on the correct calendar day, not both on the same day |
| Block excluded on days not in `daysOfWeek` | Recurring-weekly semantics, not one-off events |
| Back-to-back blocks (no gap between them) | Must not emit a zero-length slot |
| Overlapping blocks | Must be merged, not double-counted |
| Blocks covering the entire day | Must return `[]`, not a slot with `start === end` |
| `Date` object vs. ISO string input | Both input forms must agree |
| Zero-duration block (`start === end`) | Documented as "no busy time", not "full day": could otherwise go either way silently |
| Empty `daysOfWeek` | Must never occupy any day |
| A slot running to end-of-day | Must report `23:59`, never the invalid `24:00` |
| A busy block ending exactly at `23:59` | The `23:59` clamp itself could otherwise produce a phantom `{ "23:59", "23:59" }` zero-length slot |
| A busy block ending at `23:58` | Confirms the fix above doesn't also swallow a genuine final-minute slot |

Read the source next to the tests: [`src/index.ts`](src/index.ts) is under 75 lines of actual logic (the rest is type declarations and doc comments), no dependencies, no framework, nothing to configure.

## Usage

```ts
import { computeFreeSlots } from 'recurring-free-slots';

const busyBlocks = [
  { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], start: '23:00', end: '07:00' }, // sleep, every day
  { daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },        // work, weekdays
];

computeFreeSlots('2026-07-20', busyBlocks);
// => [
//   { start: '07:00', end: '09:00' },
//   { start: '17:00', end: '23:00' },
// ]

computeFreeSlots('2026-07-19', busyBlocks); // Sunday, no work block
// => [{ start: '07:00', end: '23:00' }]
```

`date` accepts either an ISO `"YYYY-MM-DD"` string or a `Date` object; the day of week is derived from it. `daysOfWeek` uses `0` (Sunday) through `6` (Saturday), matching `Date.prototype.getDay()`.

## API

### `computeFreeSlots(date, busyBlocks): Slot[]`

```ts
interface RecurringBusyBlock {
  daysOfWeek: number[]; // 0 = Sunday ... 6 = Saturday
  start: string;        // "HH:MM", 24-hour
  end: string;           // "HH:MM"; if <= start, the block wraps past midnight
}

interface Slot {
  start: string;
  end: string;
}
```

Behavior:
- Overlapping and back-to-back busy blocks are merged; no zero-length gaps are ever returned.
- A block only counts on a given day if that day's number is in `daysOfWeek`.
- An overnight block (`end <= start`) is split into two pieces: the portion from `start` to midnight counts toward the day the block is scheduled on (per `daysOfWeek`), and the portion from midnight to `end` counts toward the following calendar day automatically, whether or not that following day is separately listed in `daysOfWeek`.
- A zero-duration block (`start === end`) contributes no busy time. It is not treated as a full-day block.
- If busy blocks cover the entire day, an empty array is returned.
- The end of a slot that runs to midnight is reported as `23:59`, never the invalid `24:00`.

### `timeToMinutes(time: string): number` / `minutesToTime(minutes: number): string`

Small exported helpers for converting between `"HH:MM"` and minutes-since-midnight, in case you need to do your own interval math alongside `computeFreeSlots`.

## Install

```bash
npm install recurring-free-slots
```

Zero dependencies. Fully typed. Works in Node, the browser, or React Native.

## What this is not

- Not a calendar/date library: it doesn't handle timezones, DST, or one-off (non-recurring) events. Bring your own date normalization if you need it.
- Not a full booking engine: it only answers "what's free," not "who owns this slot" or persistence.

If your problem is bigger than "given some recurring weekly blocks, what's free today," this is the wrong tool. If it's exactly that, this is a ~1KB, fully-tested drop-in.

## Where this came from

I'm building Koavi, an AI focus planner where "never suggest time over a locked block" is a hard product invariant, so this piece of its scheduling engine was written as deterministic, exhaustively tested code rather than left to an LLM's soft instruction-following. The main repo is private while it's still in active development; Koavi's waitlist is at [koavi.framer.website](https://koavi.framer.website) if you want to see what it turns into.

## License

MIT
