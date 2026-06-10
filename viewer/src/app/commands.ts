/**
 * Bank command-palette command list
 * ==================================
 * Pure factory lifted verbatim out of `App.tsx`'s `bankCommands` useMemo.
 *
 * The palette itself is mounted up at StudentShell / StaffShell; the bank
 * merges in whatever it registers via `useRegisterBankCommands`. This module
 * only builds the `Command[]` array — App.tsx keeps the `useMemo`, its
 * dependency array, and the `useRegisterBankCommands` call so hook order and
 * referential identity are unchanged.
 *
 * Every handler/state value the commands close over is passed in as a single
 * `deps` object, so the produced array is identical to the inline version.
 */
import type { Command } from "@/components/CommandPalette";
import type { ModalsApi } from "@/hooks";
import type { IndexEntry } from "@/types";

/** Everything the bank command list closes over. Mirrors the old useMemo deps. */
export interface BankCommandDeps {
  finalFiltered: IndexEntry[];
  selectedId: string | null;
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (id: string) => void;
  isDone: (id: string) => boolean;
  toggleDone: (id: string) => void;
  isSelected: (id: string) => boolean;
  toggleSelected: (id: string) => void;
  onReset: () => void;
  printSelected: () => Promise<void> | void;
  exportPdf: () => Promise<void> | void;
  modals: ModalsApi;
  toggleDark: () => void;
  showToast: (msg: string) => void;
  setSelectedId: (id: string | null) => void;
  setShowAnswer: (fn: (v: boolean) => boolean) => void;
  setShowRationale: (fn: (v: boolean) => boolean) => void;
}

export function buildBankCommands(deps: BankCommandDeps): Command[] {
  const {
    finalFiltered,
    selectedId,
    isBookmarked,
    toggleBookmark,
    isDone,
    toggleDone,
    isSelected,
    toggleSelected,
    onReset,
    printSelected,
    exportPdf,
    modals,
    toggleDark,
    showToast,
    setSelectedId,
    setShowAnswer,
    setShowRationale,
  } = deps;

  const cmds: Command[] = [
    {
      id: "bank-random-question",
      label: "Random question",
      keywords: "shuffle pick any",
      group: "Command",
      run: () => {
        if (finalFiltered.length > 0) {
          const r = Math.floor(Math.random() * finalFiltered.length);
          setSelectedId(finalFiltered[r].id);
        }
      },
    },
    {
      id: "bank-reset-filters",
      label: "Reset filters",
      keywords: "clear all defaults",
      group: "Command",
      run: () => onReset(),
    },
    {
      id: "bank-toggle-bookmark",
      label: "Toggle bookmark on current question",
      keywords: "star save favorite",
      group: "Command",
      run: () => {
        if (selectedId) {
          const was = isBookmarked(selectedId);
          toggleBookmark(selectedId);
          showToast(was ? "Removed bookmark" : "Bookmarked");
        }
      },
    },
    {
      id: "bank-toggle-done",
      label: "Toggle done on current question",
      keywords: "complete finished check",
      group: "Command",
      run: () => {
        if (selectedId) {
          const was = isDone(selectedId);
          toggleDone(selectedId);
          showToast(was ? "Marked as not done" : "Marked done");
        }
      },
    },
    {
      id: "bank-toggle-selection",
      label: "Toggle current question in print set",
      keywords: "select add remove",
      group: "Command",
      run: () => {
        if (selectedId) {
          const was = isSelected(selectedId);
          toggleSelected(selectedId);
          showToast(was ? "Removed from print set" : "Added to print set");
        }
      },
    },
    {
      id: "bank-toggle-answer",
      label: "Show / hide answer",
      keywords: "reveal solution",
      group: "Command",
      run: () => setShowAnswer((v) => !v),
    },
    {
      id: "bank-toggle-rationale",
      label: "Show / hide rationale",
      keywords: "explanation reveal",
      group: "Command",
      run: () => setShowRationale((v) => !v),
    },
    {
      id: "bank-print-selected",
      label: "Print selected questions",
      keywords: "worksheet output",
      group: "Command",
      run: () => {
        void printSelected();
      },
    },
    {
      id: "bank-export-pdf",
      label: "Export selected as PDF",
      keywords: "download save",
      group: "Command",
      run: () => {
        void exportPdf();
      },
    },
    {
      id: "bank-open-print-drawer",
      label: "Open print set drawer",
      keywords: "manage selected",
      group: "Command",
      run: () => modals.open("printDrawer"),
    },
    {
      id: "bank-open-compare",
      label: "Open compare view",
      keywords: "side by side diff",
      group: "Command",
      run: () => modals.open("compare"),
    },
    {
      id: "bank-open-stats",
      label: "Open stats panel",
      keywords: "statistics distribution",
      group: "Command",
      run: () => modals.open("stats"),
    },
    {
      id: "bank-open-dashboard",
      label: "Open progress dashboard",
      keywords: "progress overview",
      group: "Command",
      run: () => modals.open("dashboard"),
    },
    {
      id: "bank-open-quick-build",
      label: "Open quick build wizard",
      keywords: "build worksheet generate",
      group: "Command",
      run: () => modals.open("quickBuild"),
    },
    {
      id: "bank-open-timer",
      label: "Start timed practice",
      keywords: "timer session test",
      group: "Command",
      run: () => modals.open("timerSetup"),
    },
    {
      id: "bank-open-knowledge-graph",
      label: "Open knowledge graph",
      keywords: "skills map visualization",
      group: "Command",
      run: () => modals.open("graph"),
    },
    {
      id: "bank-open-reading",
      label: "Open reading mode",
      keywords: "focus read passage",
      group: "Command",
      run: () => modals.open("reading"),
    },
    {
      id: "bank-open-a11y",
      label: "Open accessibility panel",
      keywords: "a11y accessible options",
      group: "Command",
      run: () => modals.open("a11y"),
    },
    {
      id: "bank-toggle-dark-mode",
      label: "Toggle dark mode",
      keywords: "theme light night",
      group: "Command",
      run: () => toggleDark(),
    },
    {
      id: "bank-open-help",
      label: "Show keyboard shortcuts",
      keywords: "help cheatsheet keys",
      group: "Command",
      run: () => modals.open("help"),
    },
    {
      id: "bank-copy-link",
      label: "Copy link to current question",
      keywords: "share url",
      group: "Command",
      run: () => {
        navigator.clipboard
          ?.writeText(window.location.href)
          .then(
            () => showToast("Link copied"),
            () => showToast("Copy failed"),
          );
      },
    },
  ];
  return cmds;
}
