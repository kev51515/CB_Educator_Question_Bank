/**
 * Barrel for the ModulesPage internals (drag geometry, persistence + filter
 * types, leaf UI parts, inline editors, inline add/create rows). ModulesPage
 * imports the whole set via `@/teacher/modules-page`.
 *
 * Convention: files INSIDE this folder import their siblings via direct
 * relative paths (`./persistence`, `./inline-add`) — never through this
 * barrel — so the barrel stays a one-way public API with no import cycles.
 */
export * from "./dnd";
export * from "./persistence";
export * from "./parts";
export * from "./editors";
export * from "./inline-add";
export * from "./tree";
