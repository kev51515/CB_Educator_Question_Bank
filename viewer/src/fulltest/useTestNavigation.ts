/**
 * fulltest/useTestNavigation — module/question cursor for staff runners
 * ====================================================================
 * Shared free-roam navigation used by the educator Preview and Review surfaces:
 * a (module, question) cursor with prev/next that wraps across module
 * boundaries, jump-to, a nav-popover open flag, and ←/→ keyboard movement.
 */
import { useCallback, useEffect, useState } from "react";
import type { TestContentModule } from "./testContent";

export interface TestNavigation {
  mi: number;
  qi: number;
  setQi: (i: number) => void;
  navOpen: boolean;
  setNavOpen: (open: boolean | ((v: boolean) => boolean)) => void;
  activeModule: TestContentModule | null;
  questions: TestContentModule["questions"];
  question: TestContentModule["questions"][number] | null;
  goModule: (index: number) => void;
  goPrev: () => void;
  goNext: () => void;
  atFirst: boolean;
  atLast: boolean;
}

export function useTestNavigation(modules: TestContentModule[]): TestNavigation {
  const [mi, setMi] = useState(0);
  const [qi, setQi] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

  const activeModule = modules[mi] ?? null;
  const questions = activeModule?.questions ?? [];
  const question = questions[qi] ?? null;

  const goModule = useCallback((next: number) => {
    setMi(next);
    setQi(0);
    setNavOpen(false);
  }, []);

  const goPrev = useCallback(() => {
    setNavOpen(false);
    if (qi > 0) {
      setQi(qi - 1);
    } else if (mi > 0) {
      const prevLen = modules[mi - 1]?.questions.length ?? 0;
      setMi(mi - 1);
      setQi(Math.max(0, prevLen - 1)); // wrap to previous module's last question
    }
  }, [qi, mi, modules]);

  const goNext = useCallback(() => {
    setNavOpen(false);
    if (qi < questions.length - 1) {
      setQi(qi + 1);
    } else if (mi < modules.length - 1) {
      setMi(mi + 1);
      setQi(0); // wrap to next module's first question
    }
  }, [qi, questions.length, mi, modules.length]);

  // ←/→ move between questions (ignored while typing in an input/textarea).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  return {
    mi,
    qi,
    setQi,
    navOpen,
    setNavOpen,
    activeModule,
    questions,
    question,
    goModule,
    goPrev,
    goNext,
    atFirst: mi === 0 && qi === 0,
    atLast: mi === modules.length - 1 && qi === questions.length - 1,
  };
}
