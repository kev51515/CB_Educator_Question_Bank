/**
 * ivyFonts — the Ivy Ledger webfonts, isolated so Vite code-splits them.
 * Imported dynamically by lib/theme.ts the first time the 'ivy' theme is
 * applied; classic-theme users never download these.
 *
 *   Newsreader  — display serif (page titles, ceremonial numerals)
 *   Onest       — UI sans (replaces the system stack under .theme-ivy)
 *   Literata    — passage/reading serif (runner, review surfaces)
 *   Fragment Mono — timers, login codes, tabular score digits
 */
import "@fontsource-variable/newsreader/index.css";
import "@fontsource-variable/onest/index.css";
import "@fontsource-variable/literata/index.css";
import "@fontsource/fragment-mono/index.css";
