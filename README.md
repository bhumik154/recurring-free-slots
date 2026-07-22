# recurring-free-slots

Compute a day's **free** time slots from a list of **recurring weekly busy blocks**, correctly handling blocks that wrap past midnight (sleep, night shifts, overnight holds) and blocks that overlap or sit back-to-back.

Zero dependencies. ~80 lines. Fully typed. Works in Node, the browser, or React Native.

```bash
npm install recurring-free-slots
```

## Why this exists

Free/busy computation shows up in every scheduling tool (booking systems, shift planners, calendar apps, availability finders), and the overnight-wrap case is where most hand-rolled versions quietly break: a "Sleep 23:00-07:00" block, or a night-shift block, spans midnight and needs to occupy the *tail* of one day and the *start* of the next. Get the interval math wrong here and you either double-book someone across midnight or silently propose a slot on top of a block that's supposed to be locked.

This library was extracted from the scheduling engine of [Koavi](https://github.com/bhumik154/koavi), an AI focus planner where "never suggest time over a locked block" is a hard product invariant, trusted to deterministic, exhaustively tested code specifically because it's too important to leave to an LLM's soft instruction-following. That same algorithm is generically useful, so it's a standalone package now.

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
- An overnight block (`end <= start`) is split into two pieces internally: the portion from `start` to midnight, and the portion from midnight to `end`. This correctly blocks time on both the day it starts and the day it ends, as long as the block is scheduled on both of those days.
- If busy blocks cover the entire day, an empty array is returned.

### `timeToMinutes(time: string): number` / `minutesToTime(minutes: number): string`

Small exported helpers for converting between `"HH:MM"` and minutes-since-midnight, in case you need to do your own interval math alongside `computeFreeSlots`.

## What this is *not*

- Not a calendar/date library: it doesn't handle timezones, DST, or one-off (non-recurring) events. Bring your own date normalization if you need it.
- Not a full booking engine: it only answers "what's free," not "who owns this slot" or persistence.

If your problem is bigger than "given some recurring weekly blocks, what's free today," this is the wrong tool. If it's exactly that, this is a ~1KB, fully-tested drop-in.

## License

MIT
