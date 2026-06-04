/**
 * Calendar barrel. Single import surface for the staff calendar page and its
 * internals (helpers + view components). Files inside this folder import
 * siblings via `./` directly — never through this barrel — so there are no cycles.
 */
export { CalendarPage } from "./CalendarPage";
export * from "./helpers";
export * from "./components";
