/**
 * useKeyboardShortcuts
 * ====================
 * Window-level keyboard bindings for the viewer. Encapsulates the entire
 * shortcut table — see the `HelpOverlay` component for the user-facing list.
 *
 * The hook intentionally accepts a wide options bag rather than reading state
 * from a Context. This keeps the hook itself stateless and easy to test, and
 * makes the call-site dependencies explicit.
 *
 * Bindings are skipped when focus is inside a text-editable element, with the
 * sole exception of ⌘K (palette) and Esc (blur).
 */
import { useEffect, type RefObject } from "react";
import type { IndexEntry } from "@/types";

interface KeyboardShortcutsOptions {
  /** Currently-visible (filtered) list, used by next/prev/random. */
  finalFiltered: IndexEntry[];
  /** Currently-selected question id, or null. */
  selectedId: string | null;
  /** Whether the help overlay is open (changes binding semantics). */
  helpOpen: boolean;
  /** Predicates over local-storage sets. */
  isBookmarked: (id: string) => boolean;
  isDone: (id: string) => boolean;
  isSelected: (id: string) => boolean;
  /** Toggles. */
  toggleBookmark: (id: string) => void;
  toggleDone: (id: string) => void;
  toggleSelected: (id: string) => void;
  /** Font size offset and setter. */
  fontStep: number;
  setFontStep: (next: number) => void;
  /** Setters that drive UI state. */
  setSelectedId: (id: string | null) => void;
  setShowAnswer: (updater: (v: boolean) => boolean) => void;
  setShowRationale: (updater: (v: boolean) => boolean) => void;
  /** Open the help overlay (`?` shortcut). */
  openHelp: () => void;
  /** Close the help overlay (Esc / `?` while open). */
  closeHelp: () => void;
  /** Toggle the command palette (⌘K / Ctrl+K). */
  togglePalette: () => void;
  /** Search input — focused on `/`. */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Lightweight transient notification. */
  showToast: (msg: string) => void;
}

export function useKeyboardShortcuts(opts: KeyboardShortcutsOptions) {
  const {
    finalFiltered,
    selectedId,
    helpOpen,
    isBookmarked,
    isDone,
    isSelected,
    toggleBookmark,
    toggleDone,
    toggleSelected,
    fontStep,
    setFontStep,
    setSelectedId,
    setShowAnswer,
    setShowRationale,
    openHelp,
    closeHelp,
    togglePalette,
    searchInputRef,
    showToast,
  } = opts;

  useEffect(() => {
    const navigate = (delta: number) => {
      if (finalFiltered.length === 0) return;
      const idx = finalFiltered.findIndex((e) => e.id === selectedId);
      const nextIdx =
        idx === -1 ? 0 : Math.max(0, Math.min(finalFiltered.length - 1, idx + delta));
      setSelectedId(finalFiltered[nextIdx].id);
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

      // ⌘K / Ctrl+K is the one shortcut that fires even while in a field.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (inField) {
        if (e.key === "Escape") (t as HTMLInputElement).blur();
        return;
      }
      // Modifier keys block all single-letter shortcuts (avoid stealing browser combos).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // While help is open, only Esc and ? do anything.
      if (helpOpen) {
        if (e.key === "Escape" || e.key === "?" || (e.shiftKey && e.key === "/")) {
          e.preventDefault();
          closeHelp();
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        navigate(1);
      } else if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        navigate(-1);
      } else if (key === "a") {
        e.preventDefault();
        setShowAnswer((v) => !v);
      } else if (key === "r") {
        e.preventDefault();
        setShowRationale((v) => !v);
      } else if (key === "b" && selectedId) {
        e.preventDefault();
        const willAdd = !isBookmarked(selectedId);
        toggleBookmark(selectedId);
        showToast(willAdd ? "Bookmarked" : "Removed bookmark");
      } else if (key === "d" && selectedId) {
        e.preventDefault();
        const willAdd = !isDone(selectedId);
        toggleDone(selectedId);
        showToast(willAdd ? "Marked done" : "Marked as not done");
      } else if (key === "n" && selectedId) {
        e.preventDefault();
        // Detail listens for this on `window`; loose coupling sidesteps prop-drilling.
        window.dispatchEvent(new CustomEvent("sat:toggle-note"));
      } else if (key === "s" && selectedId) {
        e.preventDefault();
        const wasIn = isSelected(selectedId);
        toggleSelected(selectedId);
        showToast(wasIn ? "Removed from print set" : "Added to print set");
      } else if (key === "g" && finalFiltered.length > 0) {
        e.preventDefault();
        const r = Math.floor(Math.random() * finalFiltered.length);
        setSelectedId(finalFiltered[r].id);
        showToast("Random question");
      } else if (key === "c" && selectedId) {
        e.preventDefault();
        navigator.clipboard?.writeText(window.location.href).then(
          () => showToast("Link copied"),
          () => showToast("Copy failed"),
        );
      } else if (key === "=" || key === "+") {
        e.preventDefault();
        setFontStep(fontStep + 1);
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        setFontStep(fontStep - 1);
      } else if (key === "0") {
        e.preventDefault();
        setFontStep(0);
      } else if (key === "p") {
        e.preventDefault();
        window.print();
      } else if (key === "?" || (e.shiftKey && key === "/")) {
        e.preventDefault();
        openHelp();
      } else if (key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "Escape") {
        closeHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    finalFiltered,
    selectedId,
    helpOpen,
    isBookmarked,
    isDone,
    isSelected,
    toggleBookmark,
    toggleDone,
    toggleSelected,
    fontStep,
    setFontStep,
    setSelectedId,
    setShowAnswer,
    setShowRationale,
    openHelp,
    closeHelp,
    togglePalette,
    searchInputRef,
    showToast,
  ]);
}
