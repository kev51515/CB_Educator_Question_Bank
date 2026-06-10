/**
 * StudentCoursesPage
 * ==================
 * The "Courses" destination on the student left rail / bottom tab bar. Lists the
 * courses the student is enrolled in (reuses MyClassesPanel — open / leave /
 * sort, RLS-scoped) and exposes a always-available "Join a class" action so a
 * student can add a class even when they already have one (the panel itself only
 * surfaces join from its empty state).
 */
import { useState } from "react";
import { MyClassesPanel } from "./MyClassesPanel";
import { JoinClassModal } from "./JoinClassModal";

export function StudentCoursesPage() {
  const [showJoin, setShowJoin] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Courses
        </h1>
        <button
          type="button"
          onClick={() => setShowJoin(true)}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3.5 py-2 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
        >
          + Join a class
        </button>
      </div>

      <MyClassesPanel refreshToken={refreshToken} />

      <JoinClassModal
        open={showJoin}
        onClose={() => setShowJoin(false)}
        onJoined={() => {
          setShowJoin(false);
          setRefreshToken((n) => n + 1);
        }}
      />
    </div>
  );
}
