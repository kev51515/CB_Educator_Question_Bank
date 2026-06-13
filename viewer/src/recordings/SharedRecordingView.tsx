/**
 * SharedRecordingView — a read-only recording view (audio + AI notes + full
 * transcript) for anyone allowed to READ the recording: the owner, or a student
 * the recording was shared to (via recording_shares → enrolled course; RLS in
 * migration 0225). Rendered at the role-agnostic /recordings/:id route in both
 * the staff and student route trees, used as the target of a "recording" module
 * item. No editing, no quiz, no recorder — just viewing.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components";
import { useRecordingDetail } from "./useRecordings";
import { Waveform } from "./Waveform";
import { fmtTs, relativeTime, speakerDisplay } from "./format";
import { NoteSectionHeading } from "./notesUi";

export function SharedRecordingView() {
  const { recordingId = "" } = useParams();
  const { detail, loading, error } = useRecordingDetail(recordingId);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ?? "This recording isn't available."}
        </p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-indigo-600 hover:underline">
          ← Back
        </button>
      </div>
    );
  }

  const { recording, parts, notes } = detail;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-indigo-600 hover:underline">
        ← Back
      </button>

      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{recording.title}</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        {relativeTime(recording.created_at)} ·{" "}
        {recording.subject_type === "session" ? "Session" : "Voice note"}
      </p>

      {notes && (
        <div className="mb-6 space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          {notes.tldr && (
            <div>
              <NoteSectionHeading kind="summary">Summary</NoteSectionHeading>
              <p className="text-sm text-slate-800 dark:text-slate-200">{notes.tldr}</p>
            </div>
          )}
          {notes.topics.length > 0 && (
            <div>
              <NoteSectionHeading kind="topics">Topics</NoteSectionHeading>
              <ul className="space-y-2">
                {notes.topics.map((t, i) => (
                  <li key={i}>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{t.summary}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {notes.action_items.length > 0 && (
            <div>
              <NoteSectionHeading kind="actions">Action items</NoteSectionHeading>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-200">
                {notes.action_items.map((a, i) => (
                  <li key={i}>{a.text}{a.owner ? ` — ${a.owner}` : ""}</li>
                ))}
              </ul>
            </div>
          )}
          {notes.highlights.length > 0 && (
            <div>
              <NoteSectionHeading kind="highlights">Highlights</NoteSectionHeading>
              <ul className="space-y-1">
                {notes.highlights.map((h, i) => (
                  <li key={i} className="border-l-2 border-indigo-300 pl-3 text-sm italic text-slate-700 dark:text-slate-300">
                    "{h.quote}"
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {parts
          .filter((p) => p.transcript?.length || p.audio_path)
          .map((p) => (
            <section key={p.id} className="border-t border-slate-200 pt-4 dark:border-slate-700">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
                Part {p.part_index}
              </h3>
              {p.transcript && p.transcript.length > 0 && (
                <div className="space-y-2">
                  {p.transcript.map((u, i) => (
                    <p key={i} className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                      <span className="mr-2 font-medium text-slate-500 dark:text-slate-400">
                        {speakerDisplay(u.speaker)}
                        <span className="ml-1 text-xs text-slate-400">{fmtTs(u.start_ms)}</span>:
                      </span>
                      {u.text}
                    </p>
                  ))}
                </div>
              )}
              {p.audio_path && <RecordingPartAudio path={p.audio_path} />}
            </section>
          ))}
      </div>
    </div>
  );
}

/** Signed-URL audio playback for a shared part (mirrors the detail page). */
function RecordingPartAudio({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.storage
      .from("recordings")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return null;
  return <Waveform src={url} />;
}
