/**
 * App
 * ===
 * Root of the viewer. Wires the three-pane layout (Sidebar | QuestionList |
 * Detail), URL-hash state synchronization, keyboard shortcuts, modal/dialog
 * orchestration, persistent local-storage state (bookmarks, done, selected,
 * notes, font-size, recent), and the various practice/timer/dashboard modes.
 *
 * Imports come from three buckets:
 *   `@/components` — UI building blocks
 *   `@/hooks`      — custom hooks (local-storage, media query, filter history)
 *   `@/types`      — shared types + URL-hash parsers
 *
 * If you're touching state ownership: search-and-jump beats scrolling. The
 * `App()` function below declares ~25 pieces of state in two groups: ephemeral
 * (search, modals, hover) and persistent (LocalStorage-backed).
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BatchOpsBar,
  DarkModeToggle,
  Detail,
  DraggablePrintList,
  ExportMenu,
  HelpOverlay,
  // Lazy-loaded heavy panels: chunk only fetched when their open-flag turns on.
  LazyA11yPanel,
  LazyCalibrationView,
  LazyCompareView,
  LazyCustomizerPanel,
  LazyKnowledgeGraph,
  LazyMaintainerView,
  LazyProgressDashboard,
  LazyQuickBuildWizard,
  LazyReadingMode,
  LazyStateExportPanel,
  LazyTimerSetup,
  MobileTabBar,
  ModeToggle,
  PrintSet,
  PrintSetAnalytics,
  QuestionList,
  parseShareParam,
  ShareButton,
  SidebarV2,
  SplashScreen,
  StatsPanel,
  TimerBar,
  useDarkMode,
  useFilterHistory,
  useFilterShortcuts,
  useQuestionFlags,
  useQuestionTags,
  useTags,
} from "@/components";
import {
  applyAllFilters,
  AVAILABLE_SETS,
  baseForSet,
  facetStateToFilters,
  fetchJson,
  filtersToFacetState,
  missingRequired,
  sanitizeFilters,
  type FacetState,
} from "@/lib";
import {
  useKeyboardShortcuts,
  useLocalStorageConfidence,
  useLocalStorageJSON,
  useLocalStorageMap,
  useLocalStorageNumber,
  useLocalStorageRecent,
  useLocalStorageSet,
  useMediaQuery,
  useModals,
} from "@/hooks";
import {
  buildHash,
  emptyFilters,
  filtersEqual,
  parseUrlState,
  type Filters,
  type IndexEntry,
  type Question,
} from "@/types";
// Feature hooks and lightweight indicators (kept eager: small + needed before any modal opens).
import {
  A11yToggle,
  DueReviewIndicator,
  findSimilarQuestions,
  LanSyncIndicator,
  useA11yPrefs,
  useActivityLog,
  useChoiceNotes,
  useFilterPresets,
  useLanSync,
  useShortcuts,
  useSpacedRepetition,
  useSwipeNav,
  useTimeTracker,
  useWeakSkills,
  WeakSkillsToggle,
} from "@/components";
import { useIndexedDBCache } from "./IndexedDBCache";
import type { Command } from "@/components/CommandPalette";
import { useRegisterBankCommands } from "@/lib/BankCommandsContext";
import {
  CACHE_MAX,
  FONT_MAX,
  FONT_MIN,
  FONT_STEP_PX,
  PREFETCH_RANGE,
} from "./app/constants";
import { buildBankCommands } from "./app/commands";

function App() {
  // Hydrate from URL hash so deep-links restore filters + selected id
  const initial = useMemo(() => parseUrlState(window.location.hash), []);
  const [isDark, toggleDark] = useDarkMode();
  const [viewMode, setViewMode] = useState<"browse" | "practice" | "flashcard">("browse");
  // Consolidated modal/overlay visibility — replaces ~16 individual useStates.
  // See `useModals` for the full list of tracked overlays.
  const modals = useModals();
  const [timerActive, setTimerActive] = useState(false);
  const [timerConfig, setTimerConfig] = useState<{ minutes: number; questionCount: number } | null>(null);
  const [timerQuestions, setTimerQuestions] = useState<string[]>([]);
  const [timerIndex, setTimerIndex] = useState(0);
  const [index, setIndex] = useState<IndexEntry[] | null>(null);
  const [indexErr, setIndexErr] = useState<string | null>(null);
  const [filters, setFiltersRaw] = useState<Filters>(initial.filters);
  const [facetState, setFacetState] = useState<FacetState>(() =>
    filtersToFacetState(initial.filters),
  );
  const [search, setSearch] = useState<string>(initial.filters.search);
  // Single setter that keeps Filters + FacetState + search in sync. Use this
  // anywhere we used to call setFilters(...).
  const setFilters = useCallback(
    (patch: Filters | ((prev: Filters) => Filters)) => {
      setFiltersRaw((prev) => {
        const next = typeof patch === "function" ? patch(prev) : patch;
        setFacetState(filtersToFacetState(next));
        setSearch(next.search);
        return next;
      });
    },
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId);
  const [setId, setSetId] = useState<string>(initial.setId);
  const dataBase = baseForSet(setId);
  const [question, setQuestion] = useState<Question | null>(null);
  const [qLoading, setQLoading] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showRationale, setShowRationale] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fetchSeq = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Persistent state
  const [bookmarks, toggleBookmark, isBookmarked] = useLocalStorageSet("sat:bookmarks");
  const [done, toggleDone, isDone] = useLocalStorageSet("sat:done");
  const [selected, toggleSelected, isSelected] = useLocalStorageSet("sat:selected");
  const selectionAnchor = useRef<string | null>(null);

  const selectRange = useCallback(
    (fromId: string, toId: string, list: IndexEntry[]) => {
      const i = list.findIndex((e) => e.id === fromId);
      const j = list.findIndex((e) => e.id === toId);
      if (i < 0 || j < 0) return;
      const [a, b] = i <= j ? [i, j] : [j, i];
      // Add everything in the range; never remove (range-click is "add to set")
      for (let k = a; k <= b; k++) {
        if (!isSelected(list[k].id)) toggleSelected(list[k].id);
      }
    },
    [isSelected, toggleSelected],
  );
  const notes = useLocalStorageMap("sat:notes");
  const [fontStep, setFontStep] = useLocalStorageNumber("sat:font-step", 0, FONT_MIN, FONT_MAX);
  const [printQuestions, setPrintQuestions] = useState<Question[] | null>(null);
  const [recent, pushRecent] = useLocalStorageRecent("sat:recent", 20);
  const confidence = useLocalStorageConfidence("sat:confidence");
  const [printOrder, setPrintOrder] = useLocalStorageJSON<string[]>("sat:print-order", []);
  const [compactList, setCompactList] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState<Set<string>>(new Set());
  const [weakSkillsOnly, setWeakSkillsOnly] = useState(false);
  const { weakSkills } = useWeakSkills();
  const tags = useTags("sat:tags");
  const questionTags = useQuestionTags("sat:question-tags");
  const questionFlags = useQuestionFlags("sat:flags");
  const filterHistory = useFilterHistory(filters);

  // New hooks (a11y, activity, time, choice notes, filter presets, shortcuts)
  // Note: these are wired here for persistence/cross-tab sync even when the
  // host panel manages its own internal state (e.g. A11yPanel).
  useA11yPrefs("sat:a11y-prefs");
  const activityLog = useActivityLog("sat:activity-log");
  const timeTracker = useTimeTracker("sat:time-tracker");
  useChoiceNotes("sat:choice-notes");
  const filterPresetsHook = useFilterPresets("sat:filter-presets");
  const shortcutsHook = useShortcuts("sat:shortcuts");
  const sr = useSpacedRepetition("sat:spaced-rep");
  const lanSync = useLanSync("sat:sync", { autoSyncInterval: 30000 });
  const idbCache = useIndexedDBCache();

  useEffect(() => {
    const currentIds = [...selected];
    setPrintOrder((prev) => {
      const inSet = new Set(currentIds);
      const kept = prev.filter((id) => inSet.has(id));
      const newIds = currentIds.filter((id) => !kept.includes(id));
      return [...kept, ...newIds];
    });
  }, [selected]);

  const [drawerQuestions, setDrawerQuestions] = useState<Question[]>([]);
  const [compareLeft, setCompareLeft] = useState<{ q: Question | null; num: number | null }>({ q: null, num: null });
  const [compareRight, setCompareRight] = useState<{ q: Question | null; num: number | null }>({ q: null, num: null });

  // Mobile responsive: below 900px, only one panel is visible at a time.
  const isMobile = useMediaQuery("(max-width: 899px)");
  const [mobileTab, setMobileTab] = useState<"filters" | "list" | "detail">("list");
  // When a question is picked on mobile, hop to the detail view automatically.
  const onMobileSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (isMobile) setMobileTab("detail");
    },
    [isMobile],
  );

  // Import shared set from URL on mount
  useEffect(() => {
    const shared = parseShareParam();
    if (shared && shared.length > 0) {
      for (const id of shared) {
        if (!isSelected(id)) toggleSelected(id);
      }
      showToast(`Imported ${shared.length} questions into print set`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skill / weak query-param hand-off from SkillHeatmap and the
  // AreaSelector "Drill weak skills" CTA. Reads `?skill=<name>` and
  // `?weak=1` from the URL on mount and applies them as filters / toggles.
  // Strips the params after applying so a refresh doesn't keep re-asserting
  // them.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const skill = params.get("skill");
    const weak = params.get("weak");
    let touched = false;
    if (skill) {
      setFilters({ ...emptyFilters(), skills: new Set([skill]) });
      showToast(`Drilling ${skill}`);
      touched = true;
    }
    if (weak === "1") {
      setWeakSkillsOnly(true);
      touched = true;
    }
    if (touched) {
      params.delete("skill");
      params.delete("weak");
      const next =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState(null, "", next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track recent views
  useEffect(() => {
    if (selectedId && index?.some((e) => e.id === selectedId)) {
      pushRecent(selectedId);
      activityLog.log(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, index, pushRecent]);

  // Time tracking: start a session per selected question, stop on change/unmount.
  useEffect(() => {
    if (!selectedId) return;
    timeTracker.start(selectedId);
    return () => timeTracker.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // LRU cache of question fetches (declared up here so other callbacks can use it)
  const cacheRef = useRef<Map<string, Promise<Question>>>(new Map());
  const cachePut = useCallback((id: string, p: Promise<Question>) => {
    const c = cacheRef.current;
    c.delete(id);
    c.set(id, p);
    while (c.size > CACHE_MAX) {
      const first = c.keys().next().value;
      if (first === undefined) break;
      c.delete(first);
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 1500);
  }, []);

  const printDrawerOpen = modals.isOpen("printDrawer");
  useEffect(() => {
    if (!printDrawerOpen || !index || selected.size === 0) {
      setDrawerQuestions([]);
      return;
    }
    const ids = [...selected];
    const entries = ids
      .map((id) => index.find((e) => e.id === id))
      .filter((e): e is IndexEntry => Boolean(e));
    Promise.all(
      entries.map(async (e) => {
        let p = cacheRef.current.get(e.id);
        if (!p) {
          p = fetchJson<Question>(`${dataBase}/${e.path}`);
          cachePut(e.id, p);
        }
        return p;
      }),
    ).then(setDrawerQuestions).catch(() => setDrawerQuestions([]));
  }, [printDrawerOpen, index, selected, dataBase, cachePut]);

  // Print-set: assemble all selected questions, then print
  const printSelected = useCallback(async () => {
    if (!index || selected.size === 0) return;
    const ids = [...selected];
    const entries = ids
      .map((id) => index.find((e) => e.id === id))
      .filter((e): e is IndexEntry => Boolean(e));
    if (entries.length === 0) return;
    // Sort by number for stable worksheet ordering
    entries.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    modals.open("print");
    showToast(`Preparing ${entries.length} question${entries.length === 1 ? "" : "s"}…`);
    try {
      const qs = await Promise.all(
        entries.map(async (e) => {
          let p = cacheRef.current.get(e.id);
          if (!p) {
            p = fetchJson<Question>(`${dataBase}/${e.path}`);
            cachePut(e.id, p);
          }
          return p;
        }),
      );
      setPrintQuestions(qs);
      // Give React a tick to render the print container before triggering print
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 60));
      window.print();
    } catch (e) {
      showToast("Couldn't fetch selected questions");
      console.error(e);
    } finally {
      // Keep the rendered container around briefly so the print dialog can use it
      window.setTimeout(() => {
        modals.close("print");
        setPrintQuestions(null);
      }, 800);
    }
  }, [index, selected, showToast, modals]);

  const exportPdf = useCallback(async () => {
    if (!index || selected.size === 0) return;
    const ids = [...selected];
    const entries = ids
      .map((id) => index.find((e) => e.id === id))
      .filter((e): e is IndexEntry => Boolean(e));
    if (entries.length === 0) return;
    entries.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    showToast(`Preparing PDF for ${entries.length} question${entries.length === 1 ? "" : "s"}…`);
    try {
      const qs = await Promise.all(
        entries.map(async (e) => {
          let p = cacheRef.current.get(e.id);
          if (!p) {
            p = fetchJson<Question>(`${dataBase}/${e.path}`);
            cachePut(e.id, p);
          }
          return p;
        }),
      );
      const nums = Object.fromEntries(
        qs.map((q) => [q.questionId, index?.find((e) => e.id === q.questionId)?.number ?? null]),
      );
      const { generateWorksheetHTML } = await import("@/components/PdfExport");
      const html = generateWorksheetHTML(qs, nums, notes.all());
      const w = window.open("", "_blank");
      if (!w) { showToast("Pop-up blocked"); return; }
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.print(); setTimeout(() => w.close(), 1000); }, 400);
    } catch {
      showToast("Couldn't generate PDF");
    }
  }, [index, selected, showToast, dataBase, cachePut, notes]);

  // Load index.json — re-fetches when the active Set changes.
  useEffect(() => {
    let cancelled = false;
    setIndex(null);
    setIndexErr(null);
    setQuestion(null);
    cacheRef.current.clear();
    fetchJson<IndexEntry[]>(`${dataBase}/index.json`)
      .then((data) => !cancelled && setIndex(data))
      .catch((e: unknown) => !cancelled && setIndexErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [dataBase]);

  // Sanitize filters whenever the index changes or the user manipulates filters.
  // This prunes unknown values (legacy URLs, manual edits) and orphans created by
  // cascade changes (e.g. selected Skill no longer valid for current Section).
  useEffect(() => {
    if (!index) return;
    const next = sanitizeFilters(index, filters);
    if (next !== filters) setFilters(next);
  }, [index, filters]);

  const missing = useMemo(() => missingRequired(filters), [filters]);
  const setupComplete = missing.length === 0;

  const filtered = useMemo(
    () =>
      index
        ? applyAllFilters(index, facetState, search, bookmarks, done, selected)
        : [],
    [index, facetState, search, bookmarks, done, selected],
  );

  const finalFiltered = useMemo(() => {
    let out = filtered;
    if (activeTagFilter.size > 0) {
      out = out.filter((e) => {
        const qTags = questionTags.getTagIds(e.id);
        return [...activeTagFilter].some((tagId) => qTags.includes(tagId));
      });
    }
    if (weakSkillsOnly && weakSkills.size > 0) {
      out = out.filter((e) => weakSkills.has(e.skill));
    }
    return out;
  }, [filtered, activeTagFilter, questionTags, weakSkillsOnly, weakSkills]);

  useFilterShortcuts({
    filters,
    onChange: setFilters,
    filterHistory: filterHistory.history,
    onUndo: () => {
      const prev = filterHistory.undo();
      if (prev) setFilters(prev);
    },
  });

  // Keep selectedId valid relative to current filtered list
  useEffect(() => {
    if (finalFiltered.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !finalFiltered.some((e) => e.id === selectedId)) {
      setSelectedId(finalFiltered[0].id);
    }
  }, [finalFiltered, selectedId]);

  // Mirror filters + selectedId + setId into URL hash
  useEffect(() => {
    const target = buildHash({ selectedId, filters, setId });
    const current = window.location.hash;
    if (current !== target) {
      history.replaceState(null, "", target || window.location.pathname);
    }
  }, [filters, selectedId, setId]);

  // Listen for hash changes (back/forward / external link)
  useEffect(() => {
    const onHash = () => {
      const next = parseUrlState(window.location.hash);
      if (!filtersEqual(next.filters, filters)) setFilters(next.filters);
      if (next.selectedId && next.selectedId !== selectedId) setSelectedId(next.selectedId);
      if (next.setId !== setId) setSetId(next.setId);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [filters, selectedId, setId]);

  // Load (or reuse) the selected question via cache
  useEffect(() => {
    if (!selectedId || !index) return;
    const entry = index.find((e) => e.id === selectedId);
    if (!entry) {
      setQuestion(null);
      setQErr("Question not found in index.");
      return;
    }
    const mySeq = ++fetchSeq.current;
    setQLoading(true);
    setQErr(null);
    setShowAnswer(false);
    setShowRationale(false);

    const url = `${dataBase}/${entry.path}`;
    let promise = cacheRef.current.get(entry.id);
    if (!promise) {
      promise = (async () => {
        // Try IndexedDB first if ready
        if (idbCache.ready) {
          try {
            const cached = await idbCache.get(entry.id);
            if (cached) return cached as Question;
          } catch {
            /* fall through to network */
          }
        }
        const fresh = await fetchJson<Question>(url);
        // Best-effort write to IDB
        if (idbCache.ready) {
          idbCache.put(entry.id, fresh).catch(() => {});
        }
        return fresh;
      })();
      cachePut(entry.id, promise);
    }
    promise
      .then((q) => {
        if (mySeq === fetchSeq.current) {
          setQuestion(q);
          setQLoading(false);
        }
      })
      .catch((e: unknown) => {
        cacheRef.current.delete(entry.id); // drop rejected promise so retry works
        if (mySeq === fetchSeq.current) {
          setQErr(e instanceof Error ? e.message : String(e));
          setQuestion(null);
          setQLoading(false);
        }
      });
  }, [selectedId, index]);

  // Prefetch a few neighbors after a short idle to make J/K feel instant.
  // Prefetch failures are swallowed silently — they shouldn't surface to the UI.
  useEffect(() => {
    if (!selectedId || finalFiltered.length === 0) return;
    const idx = finalFiltered.findIndex((e) => e.id === selectedId);
    if (idx < 0) return;
    const timer = window.setTimeout(() => {
      for (let d = 1; d <= PREFETCH_RANGE; d++) {
        for (const n of [finalFiltered[idx + d], finalFiltered[idx - d]]) {
          if (n && !cacheRef.current.has(n.id)) {
            const p = fetchJson<Question>(`${dataBase}/${n.path}`).catch(
              (e: unknown) => {
                cacheRef.current.delete(n.id);
                throw e;
              },
            );
            cachePut(n.id, p);
          }
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedId, finalFiltered]);

  // Stable adapters for the keyboard hook. `modals.open/close/toggle` are
  // referentially stable, so these useCallbacks have empty effective deps
  // and the keydown listener is registered exactly once.
  const openHelp = useCallback(() => modals.open("help"), [modals.open]);
  const closeHelp = useCallback(() => modals.close("help"), [modals.close]);
  // togglePalette removed — the CommandPalette is now mounted at the
  // auth-shell level (StudentShell / StaffShell) and owns its own ⌘/Ctrl+K
  // keydown listener, so the bank no longer needs to drive palette state.
  const togglePalette = useCallback(() => {
    /* no-op: palette is now shell-owned */
  }, []);

  // Keyboard shortcuts: window-level bindings for navigation, modals, font size, etc.
  useKeyboardShortcuts({
    finalFiltered,
    selectedId,
    helpOpen: modals.isOpen("help"),
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
    // `modals.open/close/toggle` are referentially stable (see useModals.ts),
    // but inline arrows re-create every render and would churn the keydown
    // listener's deps. The memoized adapters just above keep identity stable.
    openHelp,
    closeHelp,
    togglePalette,
    searchInputRef,
    showToast,
  });

  const mainRef = useRef<HTMLDivElement | null>(null);

  const swipeNav = useSwipeNav({
    enabled: isMobile,
    onSwipeLeft: () => {
      const idx = finalFiltered.findIndex((e) => e.id === selectedId);
      if (idx >= 0 && idx < finalFiltered.length - 1) {
        setSelectedId(finalFiltered[idx + 1].id);
      }
    },
    onSwipeRight: () => {
      const idx = finalFiltered.findIndex((e) => e.id === selectedId);
      if (idx > 0) {
        setSelectedId(finalFiltered[idx - 1].id);
      }
    },
  });

  useEffect(() => {
    swipeNav.attach(mainRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const similarPanelData = useMemo(() => {
    if (!selectedId || !index) return undefined;
    const current = index.find((e) => e.id === selectedId);
    if (!current) return undefined;
    const similar = findSimilarQuestions(current, index, 5);
    return { current, similar };
  }, [selectedId, index]);

  const onReset = useCallback(() => setFilters(emptyFilters()), []);

  const startTimerSession = useCallback((config: { minutes: number; questionCount: number }) => {
    const count = Math.min(config.questionCount, finalFiltered.length);
    const shuffled = [...finalFiltered].sort(() => Math.random() - 0.5).slice(0, count);
    setTimerQuestions(shuffled.map(e => e.id));
    setTimerIndex(0);
    setTimerConfig(config);
    setTimerActive(true);
    if (shuffled.length > 0) setSelectedId(shuffled[0].id);
    showToast(`Started ${config.minutes}-minute session with ${count} questions`);
  }, [finalFiltered, showToast]);

  const timerNext = useCallback(() => {
    if (timerIndex < timerQuestions.length - 1) {
      const next = timerIndex + 1;
      setTimerIndex(next);
      setSelectedId(timerQuestions[next]);
    }
  }, [timerIndex, timerQuestions]);

  const timerPrev = useCallback(() => {
    if (timerIndex > 0) {
      const prev = timerIndex - 1;
      setTimerIndex(prev);
      setSelectedId(timerQuestions[prev]);
    }
  }, [timerIndex, timerQuestions]);

  const loadCompareQuestion = useCallback(
    async (side: "left" | "right", id: string) => {
      if (!index) return;
      const entry = index.find((e) => e.id === id);
      if (!entry) return;
      try {
        let promise = cacheRef.current.get(id);
        if (!promise) {
          promise = fetchJson<Question>(`${dataBase}/${entry.path}`);
          cachePut(id, promise);
        }
        const q = await promise;
        const num = entry.number ?? null;
        if (side === "left") setCompareLeft({ q, num });
        else setCompareRight({ q, num });
      } catch {
        showToast("Couldn't load question for comparison");
      }
    },
    [index, dataBase, cachePut, showToast],
  );

  // Bank-specific ⌘K commands. The palette itself is now mounted up at
  // StudentShell / StaffShell, but it merges in whatever the bank
  // registers via the `useBankCommands` subscription store. We rebuild
  // the list whenever the underlying handlers/state change; the store
  // takes care of pushing the new array to the palette and clears the
  // registration on unmount so these don't leak onto LMS routes.
  const bankCommands = useMemo<Command[]>(
    () =>
      buildBankCommands({
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
      }),
    [
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
    ],
  );

  useRegisterBankCommands(bankCommands);

  if (indexErr) {
    return (
      <SplashScreen
        mode="error"
        message={indexErr}
        hint={
          <>
            Run <code className="font-mono">python3 scripts/build_index.py</code> from the project root.
          </>
        }
      />
    );
  }

  if (!index) {
    return <SplashScreen mode="loading" />;
  }

  return (
    <div className="h-full flex flex-col font-sans text-ink-800 bg-white">
      <header className="flex items-center justify-between px-6 h-12 border-b border-ink-150 bg-white/85 backdrop-blur-xl">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[14px] font-semibold tracking-tight text-ink-800">
            OmniLMS
          </h1>
          <span className="text-[12px] text-ink-600 tabular-nums">
            {setupComplete
              ? `${finalFiltered.length.toLocaleString()} questions`
              : `${index.length.toLocaleString()} available`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ModeToggle mode={viewMode} onChange={setViewMode} />
          <button onClick={() => modals.open("quickBuild")} className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring" data-tooltip="Quick build a worksheet">Build</button>
          <button onClick={() => modals.open("timerSetup")} className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring" data-tooltip="Start timed practice">Timer</button>
          <button onClick={() => modals.open("dashboard")} className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring" data-tooltip="Your progress">Progress</button>
          <ShareButton
            selectedIds={selected}
            onImportSet={(ids) => {
              for (const id of ids) {
                if (!isSelected(id)) toggleSelected(id);
              }
              showToast(`Imported ${ids.length} questions`);
            }}
            showToast={showToast}
          />
          <button
            onClick={() => modals.open("stats")}
            className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring"
            data-tooltip="Question statistics"
          >
            Stats
          </button>
          <button
            onClick={() => modals.open("compare")}
            className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring"
            data-tooltip="Compare two questions side by side"
          >
            Compare
          </button>
          <button
            onClick={() => modals.open("graph")}
            className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring"
            data-tooltip="Knowledge graph"
          >
            Graph
          </button>
          <button
            onClick={() => modals.open("reading")}
            className="px-2.5 py-1 rounded-md text-[11.5px] text-ink-600 hover:bg-ink-100 hover:text-ink-800 transition focus-ring"
            data-tooltip="Reading mode"
          >
            Read
          </button>
          <DueReviewIndicator
            count={index ? sr.countDue(index.map((e) => e.id)) : 0}
            onClick={() => {
              if (!index) return;
              const dueIds = new Set(sr.getDueQuestions(index.map((e) => e.id)));
              const dueEntries = index.filter((e) => dueIds.has(e.id));
              if (dueEntries.length === 0) {
                showToast("No questions due for review");
                return;
              }
              showToast(`Showing ${dueEntries.length} questions due for review`);
              setSelectedId(dueEntries[0].id);
            }}
          />
          <LanSyncIndicator
            connected={lanSync.connected}
            peerCount={lanSync.peerCount}
            onClick={() => lanSync.fullSync()}
          />
          <A11yToggle onClick={() => modals.open("a11y")} />
          <DarkModeToggle isDark={isDark} onToggle={toggleDark} />
          <button
            onClick={() => modals.open("help")}
            className="w-7 h-7 rounded-full text-[13px] text-ink-500 hover:bg-ink-100 hover:text-ink-700 transition flex items-center justify-center focus-ring"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </header>
      <TimerBar
        active={timerActive}
        totalSeconds={(timerConfig?.minutes ?? 0) * 60}
        onTimeUp={() => { showToast("Time's up!"); setTimerActive(false); }}
        onStop={() => { setTimerActive(false); setTimerQuestions([]); showToast("Session ended"); }}
        questionIndex={timerIndex + 1}
        questionCount={timerQuestions.length}
        onNext={timerNext}
        onPrev={timerPrev}
      />
      <div ref={mainRef} className="flex-1 flex overflow-hidden">
        {(!isMobile || mobileTab === "filters") && (
        <SidebarV2
          index={index}
          state={facetState}
          onChange={(next) => {
            setFacetState(next);
            // Mirror into legacy filters so URL hash, DSL, presets stay aligned.
            setFiltersRaw((prev) => facetStateToFilters(next, prev.search));
          }}
          onReset={onReset}
          searchInputRef={searchInputRef}
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setFiltersRaw((prev) => ({ ...prev, search: v }));
          }}
          bookmarks={bookmarks}
          done={done}
          selected={selected}
          setId={setId}
          onSetChange={setSetId}
          availableSets={AVAILABLE_SETS}
          tags={tags.tags}
          tagCounts={questionTags.counts()}
          activeTagFilter={activeTagFilter}
          onToggleTagFilter={(tagId) => setActiveTagFilter(prev => {
            const next = new Set(prev);
            if (next.has(tagId)) next.delete(tagId);
            else next.add(tagId);
            return next;
          })}
          presets={filterPresetsHook.presets}
          onSavePreset={(name) => { filterPresetsHook.save(name, filters); showToast(`Saved preset: ${name}`); }}
          onApplyPreset={(s) => {
            setFacetState(s);
            setFiltersRaw((prev) => facetStateToFilters(s, prev.search));
          }}
          onRemovePreset={(id) => filterPresetsHook.remove(id)}
        />
        )}
        {(!isMobile || mobileTab === "list") && (
        <div className="flex flex-col gap-2">
          <div className="px-2 pt-2 flex items-center gap-2 flex-wrap">
            <WeakSkillsToggle value={weakSkillsOnly} onChange={setWeakSkillsOnly} />
          </div>
        <QuestionList
          entries={finalFiltered}
          selectedId={selectedId}
          onSelect={onMobileSelect}
          setupComplete={setupComplete}
          missingRequired={missing as string[]}
          isBookmarked={isBookmarked}
          isDone={isDone}
          isSelected={isSelected}
          onToggleSelected={(id, range) => {
            if (range && selectionAnchor.current && selectionAnchor.current !== id) {
              selectRange(selectionAnchor.current, id, finalFiltered);
            } else {
              toggleSelected(id);
            }
            selectionAnchor.current = id;
          }}
          selectedCount={selected.size}
          onClearSelected={() => {
            // Clear all
            for (const id of [...selected]) toggleSelected(id);
          }}
          onPrintSelected={printSelected}
          onExportPdf={exportPdf}
          onManagePrintSet={() => modals.open("printDrawer")}
          filters={filters}
          onReset={onReset}
          searchQuery={filters.search}
          compact={compactList}
          onToggleCompact={() => setCompactList(v => !v)}
          canUndo={filterHistory.canUndo}
          onUndo={() => { const prev = filterHistory.undo(); if (prev) setFilters(prev); }}
        />
        </div>
        )}
        {(!isMobile || mobileTab === "detail") && (
        <Detail
          question={setupComplete ? question : null}
          number={
            setupComplete && selectedId
              ? index?.find((e) => e.id === selectedId)?.number ?? null
              : null
          }
          position={
            setupComplete && selectedId
              ? finalFiltered.findIndex((e) => e.id === selectedId) + 1 || null
              : null
          }
          total={setupComplete ? finalFiltered.length : null}
          loading={setupComplete && qLoading}
          error={setupComplete ? qErr : null}
          showAnswer={showAnswer}
          showRationale={showRationale}
          onToggleAnswer={() => setShowAnswer((v) => !v)}
          onToggleRationale={() => setShowRationale((v) => !v)}
          setupComplete={setupComplete}
          missingRequired={missing as string[]}
          onReset={onReset}
          filteredCount={finalFiltered.length}
          isBookmarked={selectedId ? isBookmarked(selectedId) : false}
          isDone={selectedId ? isDone(selectedId) : false}
          onToggleBookmark={() => {
            if (selectedId) {
              const wasBookmarked = isBookmarked(selectedId);
              toggleBookmark(selectedId);
              showToast(wasBookmarked ? "Removed bookmark" : "Bookmarked");
            }
          }}
          onToggleDone={() => {
            if (selectedId) {
              const wasDone = isDone(selectedId);
              toggleDone(selectedId);
              showToast(wasDone ? "Marked as not done" : "Marked done");
            }
          }}
          onRandom={() => {
            if (finalFiltered.length > 0) {
              const r = Math.floor(Math.random() * finalFiltered.length);
              setSelectedId(finalFiltered[r].id);
            }
          }}
          onCopyLink={() => {
            navigator.clipboard
              ?.writeText(window.location.href)
              .then(() => showToast("Link copied"), () => showToast("Copy failed"));
          }}
          fontStep={fontStep}
          onFontStep={setFontStep}
          fontMin={FONT_MIN}
          fontMax={FONT_MAX}
          fontStepPx={FONT_STEP_PX}
          isInSelection={selectedId ? isSelected(selectedId) : false}
          onToggleSelection={() => {
            if (selectedId) {
              const wasIn = isSelected(selectedId);
              toggleSelected(selectedId);
              showToast(wasIn ? "Removed from print set" : "Added to print set");
            }
          }}
          note={selectedId ? notes.get(selectedId) : ""}
          onSaveNote={(text) => {
            if (selectedId) notes.set(selectedId, text);
          }}
          confidenceRating={selectedId ? confidence.get(selectedId) : 0}
          onRateConfidence={(rating) => {
            if (selectedId) {
              confidence.set(selectedId, rating);
              sr.recordReview(selectedId, rating);
            }
          }}
          onFilterSimilar={question ? () => {
            setFilters({
              ...emptyFilters(),
              difficulties: new Set([question.difficulty]),
              skills: new Set([question.skill]),
            });
            showToast("Filtered to similar questions");
          } : undefined}
          viewMode={viewMode}
          questionFlags={selectedId ? questionFlags.get(selectedId) : []}
          onAddFlag={(flag) => { if (selectedId) questionFlags.add(selectedId, flag); }}
          onRemoveFlag={(flagType) => { if (selectedId) questionFlags.remove(selectedId, flagType); }}
          tags={tags.tags}
          assignedTagIds={selectedId ? questionTags.getTagIds(selectedId) : []}
          onToggleTag={(tagId) => { if (selectedId) questionTags.addTag(selectedId, tagId); }}
          onCreateTag={(name, color) => tags.createTag(name, color)}
          similarPanelData={similarPanelData}
          onPickSimilar={(id) => setSelectedId(id)}
          onOpenReading={() => modals.open("reading")}
          showToast={showToast}
          timeStats={selectedId ? timeTracker.getStats(selectedId) : undefined}
        />
        )}
      </div>
      {isMobile && (
        <MobileTabBar
          tab={mobileTab}
          onChange={setMobileTab}
          listCount={finalFiltered.length}
          setupComplete={setupComplete}
        />
      )}
      {modals.isOpen("help") && <HelpOverlay onClose={() => modals.close("help")} />}
      {/* CommandPalette is now mounted at the auth-shell level
          (StudentShell / StaffShell) so ⌘/Ctrl+K works on every
          authenticated route — see Wave 13B follow-up. */}
      {modals.isOpen("print") && printQuestions && (
        <PrintSet
          questions={printQuestions}
          numbers={Object.fromEntries(
            printQuestions.map((q) => [
              q.questionId,
              index?.find((e) => e.id === q.questionId)?.number ?? null,
            ]),
          )}
          notes={notes.all()}
        />
      )}
      <StatsPanel
        entries={finalFiltered}
        totalCount={index.length}
        open={modals.isOpen("stats")}
        onClose={() => modals.close("stats")}
      />
      {/* Lazy panel — needs Suspense above it. The Suspense block extends
          down past all other lazy panels (QuickBuild, Timer, Progress, etc.). */}
      <Suspense fallback={null}>
      {modals.isOpen("compare") && <LazyCompareView
        open={modals.isOpen("compare")}
        onClose={() => {
          modals.close("compare");
          setCompareLeft({ q: null, num: null });
          setCompareRight({ q: null, num: null });
        }}
        leftQuestion={compareLeft.q}
        rightQuestion={compareRight.q}
        leftNumber={compareLeft.num}
        rightNumber={compareRight.num}
        index={index}
        onPickQuestion={loadCompareQuestion}
      />}
      {modals.isOpen("printDrawer") && (
        <div
          className="fixed inset-0 z-20 bg-ink-800/25 backdrop-blur-sm flex justify-end"
          onClick={() => modals.close("printDrawer")}
        >
          <div
            className="w-96 max-w-full bg-white shadow-modal h-full overflow-y-auto thin-scrollbar p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold tracking-tight">
                Print Set ({selected.size})
              </h2>
              <button
                type="button"
                onClick={() => modals.close("printDrawer")}
                className="w-7 h-7 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <BatchOpsBar
              selectedIds={[...selected]}
              onBookmarkAll={() => {
                for (const id of selected) { if (!isBookmarked(id)) toggleBookmark(id); }
                showToast(`Bookmarked ${selected.size} questions`);
              }}
              onDoneAll={() => {
                for (const id of selected) { if (!isDone(id)) toggleDone(id); }
                showToast(`Marked ${selected.size} as done`);
              }}
              onClearBookmarks={() => {
                for (const id of selected) { if (isBookmarked(id)) toggleBookmark(id); }
                showToast("Cleared bookmarks");
              }}
              onClearDone={() => {
                for (const id of selected) { if (isDone(id)) toggleDone(id); }
                showToast("Cleared done marks");
              }}
              tags={tags.tags}
              onTagAll={(tagId) => {
                for (const id of selected) { questionTags.addTag(id, tagId); }
                showToast(`Tagged ${selected.size} questions`);
              }}
              showToast={showToast}
            />
            <DraggablePrintList
              entries={index ? [...selected].map((id) => index.find((e) => e.id === id)).filter((e): e is IndexEntry => Boolean(e)) : []}
              order={printOrder}
              onReorder={setPrintOrder}
              onRemove={(id) => toggleSelected(id)}
              isBookmarked={isBookmarked}
              isDone={isDone}
            />
            {drawerQuestions.length > 0 && (
              <div className="mt-4">
                <PrintSetAnalytics
                  questions={drawerQuestions}
                  entries={index ? [...selected].map((id) => index.find((e) => e.id === id)).filter((e): e is IndexEntry => Boolean(e)) : []}
                />
              </div>
            )}
            {selected.size > 0 && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => { printSelected(); modals.close("printDrawer"); }}
                  className="flex-1 px-3 py-2 rounded-lg bg-accent-600 text-white text-[13px] font-medium hover:bg-accent-700 transition-colors focus-ring"
                >
                  Print worksheet
                </button>
                <button
                  onClick={() => { exportPdf(); modals.close("printDrawer"); }}
                  className="px-3 py-2 rounded-lg border border-ink-200 text-ink-700 text-[13px] font-medium hover:bg-ink-50 transition-colors focus-ring"
                >
                  PDF
                </button>
                {drawerQuestions.length > 0 && (
                  <ExportMenu
                    questions={drawerQuestions}
                    numbers={Object.fromEntries(
                      drawerQuestions.map((q) => [
                        q.questionId,
                        index?.find((e) => e.id === q.questionId)?.number ?? null,
                      ]),
                    )}
                    notes={notes.all()}
                    showToast={showToast}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {modals.isOpen("quickBuild") && <LazyQuickBuildWizard
        open={modals.isOpen("quickBuild")}
        onClose={() => modals.close("quickBuild")}
        index={index}
        alreadySelected={selected}
        done={done}
        onAddToSet={(ids) => { for (const id of ids) { if (!isSelected(id)) toggleSelected(id); } }}
        showToast={showToast}
      />}
      {modals.isOpen("timerSetup") && <LazyTimerSetup
        open={modals.isOpen("timerSetup")}
        onClose={() => modals.close("timerSetup")}
        filteredCount={finalFiltered.length}
        onStart={(config) => { modals.close("timerSetup"); startTimerSession(config); }}
      />}
      {modals.isOpen("dashboard") && <LazyProgressDashboard
        open={modals.isOpen("dashboard")}
        onClose={() => modals.close("dashboard")}
        index={index}
        bookmarks={bookmarks}
        done={done}
        confidence={confidence}
        recentIds={recent}
        onFilterSkill={(skill, difficulty) => {
          const f = emptyFilters();
          if (skill) f.skills = new Set([skill]);
          if (difficulty) f.difficulties = new Set([difficulty]);
          setFilters(f);
          modals.close("dashboard");
        }}
      />}
      {modals.isOpen("a11y") && <LazyA11yPanel open={modals.isOpen("a11y")} onClose={() => modals.close("a11y")} />}
      {modals.isOpen("maintainer") && <LazyMaintainerView open={modals.isOpen("maintainer")} onClose={() => modals.close("maintainer")} index={index} />}
      {modals.isOpen("graph") && <LazyKnowledgeGraph
        open={modals.isOpen("graph")}
        onClose={() => modals.close("graph")}
        index={index}
        confidence={confidence}
        done={done}
        onFilterSkill={(skill) => {
          setFilters({ ...emptyFilters(), skills: new Set([skill]) });
          modals.close("graph");
        }}
      />}
      {modals.isOpen("reading") && <LazyReadingMode
        open={modals.isOpen("reading")}
        onClose={() => modals.close("reading")}
        question={question}
        number={selectedId ? index?.find((e) => e.id === selectedId)?.number ?? null : null}
      />}
      {modals.isOpen("stateExport") && <LazyStateExportPanel
        open={modals.isOpen("stateExport")}
        onClose={() => modals.close("stateExport")}
        onApplied={(summary) => {
          showToast(summary);
          modals.close("stateExport");
        }}
      />}
      {modals.isOpen("calibration") && <LazyCalibrationView
        open={modals.isOpen("calibration")}
        onClose={() => modals.close("calibration")}
        index={index}
        confidence={confidence}
        onFilterToQuestion={(id) => {
          setSelectedId(id);
          modals.close("calibration");
        }}
      />}
      {modals.isOpen("customizer") && <LazyCustomizerPanel
        open={modals.isOpen("customizer")}
        onClose={() => modals.close("customizer")}
        shortcuts={shortcutsHook.shortcuts}
        onSetShortcut={shortcutsHook.setShortcut}
        onReset={shortcutsHook.reset}
      />}
      </Suspense>
      {toast && (
        <div
          className={
            "fixed left-1/2 -translate-x-1/2 z-20 px-3.5 py-2 rounded-full bg-ink-800 text-white text-[12.5px] shadow-modal pointer-events-none animate-[fadein_180ms_ease-out] " +
            (isMobile ? "bottom-16" : "bottom-6")
          }
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
