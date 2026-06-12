/**
 * calendar/components — barrel for the Calendar view sub-components, split out
 * of the old single `components.tsx` (was 704 lines). Consumers keep importing
 * from `@/calendar/components` (or `./components`) unchanged.
 */
export * from "./chrome";
export * from "./EventChip";
export * from "./DayPopover";
export * from "./MonthView";
export * from "./ListView";
