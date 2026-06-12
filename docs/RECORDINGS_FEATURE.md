# Recordings — audio → transcript → AI notes → quiz/assignment

Status: **Phases 0–3 backend deployed + validated on prod** (Gemini key set;
migrations 0208 + 0216 live; `transcribe-part` / `summarize-recording` /
`generate-quiz-from-recording` deployed; end-to-end test green). **The client
UI is built but NOT pushed** (held for a coordinated release). Publish-to-
assignment is deferred. Owner-facing feature for educators across all three
domains (teacher / counselor / coach).

**AI engine: Google Gemini (paid tier) for everything** — transcription AND the
text steps (Phase 2 notes, Phase 3 quiz). Chosen over AssemblyAI + Claude so it
all bills to the owner's one Google account, doesn't train on the data (paid
tier), and is architecturally simpler (synchronous, no webhook/second service,
no Anthropic key). Model: `gemini-2.5-flash` (override via `GEMINI_MODEL`).

### Build status
- ✅ **Phase 0** — migration `0208_recordings.sql` LIVE (3 tables + RLS + audit +
  private bucket + `assignments.source_recording_id`); `/educator/recordings`
  route + cross-domain nav entry.
- ✅ **Phase 1** — `viewer/src/recordings/` (Part-based `RecorderPanel`, list +
  detail pages, upload via `FileDropzone`); `transcribe-part` (Gemini, background
  via `EdgeRuntime.waitUntil`) deployed. **Validated end-to-end on prod.**
- ✅ **Phase 2** — `_shared/summarize.ts` + `summarize-recording` (Gemini →
  `recording_notes`), auto-triggered on finalize; detail-page Generate/Regenerate
  + jump-to-timestamp chips. Deployed + validated (notes auto-generate).
- ◑ **Phase 3** — migration `0216_authored_questions` LIVE,
  `generate-quiz-from-recording` (Gemini, **SAT-style or general** per recording)
  deployed + validated; `QuizDraftPanel` (generate → review/edit stem/choices/
  answer/rationale → delete/regenerate). **DEFERRED: publish-into-a-takeable-
  assignment** — couples to the assignment/runner system the parallel session is
  actively rewriting (0209–0215); needs a design decision + coordination. The
  Publish button is present but disabled with a "coming next" note.
- ⏸ **Client UI** — all phases' React is built + `tsc -b` clean (recordings
  files), but NOT pushed to `main` (held for a coordinated release). The backend
  is live and idle until the client ships.
- ⏳ **Phase 4** — consent/audit hardening, coach polish, iOS fallback, retention.
- ⏳ **Phase 5 (future, user-requested)** — **Google Meet integration in a Module**:
  link a Meet meeting to a course/module so its recording + notes flow into a
  `recordings` row and associate with that module (counseling meetings, coaching
  sessions, classes). Builds on the Google/Gemini stack already chosen. Scope TBD.

## What it is

A "Recordings" surface where an educator records or uploads audio, gets a
verbatim transcript with speaker labels, an AI-structured **Fathom-style**
summary (TL;DR · topics · action items · highlights, each linking back to the
moment in the audio), and can turn the content into a reviewable **quiz /
assignment**.

```
Record (in spurts) / upload
      │  each Part uploads + transcribes on its own
      ▼
Supabase Storage  (private 'recordings' bucket, owner-scoped)
      │
      ▼  Gemini (speaker-labelled transcript), synchronous per Part
Per-Part transcript  ──►  stitched transcript  (Part 1 / Part 2 dividers preserved)
      │
      ▼  Gemini (structured JSON output)
"Fathom" notes:  TL;DR · topics(jump-to-time) · action items · highlights
      │                    (full transcript always one toggle away)
      ▼
"Generate assignment"  →  Gemini drafts questions  →  educator edits  →  publish
```

## Key UX nuance — segmented "spurt" recording

The recorder is **part-based**, matching how people actually record:

- **● Record** starts a Part.
- **⏸ Pause** holds within the current Part (resume continues the same Part).
- **⏹ Stop Part** finalizes the current Part → it uploads and begins
  transcribing **immediately and independently**, while the educator can start
  the next Part.
- **■ End** finalizes the last Part and closes the session.

Each Part is transcribed as soon as it's stopped, so by the time the session
ends the early Parts are usually already done. On End, the Parts are stitched
in order into one transcript and one set of notes, but the boundaries stay
**visibly labeled "Part 1 / Part 2 / …"** so an intentional break is obvious to
the reader. Upload of a pre-existing file is just a single-Part recording.

## Roles & gating

One surface, relabeled per `lib/domain.ts`:
- Teacher (academic), Counselor (counseling), Coach (coaching) — `educatorLabel(domain)`.
- Gated to staff/educators at the route level (mirror `canAccessQuestionBank`
  style allow-listing in `lib/access.ts`) + RLS owner-only at the DB level.
- **Recordings are NOT visible to students.** Bucket + table RLS = owner OR
  admin only (unlike course-materials which enrolled students can read).

## Privacy & consent (the "Both" answer)

Subjects can be the educator's own voice **or** a live session with students/
clients present. So:
- `subject_type` = `'self' | 'session'`. For `'session'` the recorder requires a
  **consent checkbox** before the first Part can start (`consent_obtained`,
  optional `consent_note`).
- Counseling recordings are sensitive: an **audit trigger** logs every
  recording write to `audit_events` (actor, action, changed *field names* only —
  never transcript/audio content), mirroring migration 0203 / 0062.
- ⚠️ **Policy is the owner's call.** We build the consent gate + audit trail;
  the actual consent/recording-of-minors policy (what the checkbox asserts,
  retention, deletion rights) must be confirmed by the product owners before
  GA. Flag in PR review.

## Data model (new migration)

| Table | Purpose | Notable columns |
|---|---|---|
| `recordings` | one session | `owner_id`, `course_id?`, `domain`, `title`, `subject_type`, `consent_obtained`, `consent_note?`, `status` (`recording`/`processing`/`ready`/`failed`), `duration_s` |
| `recording_parts` | the Parts | `recording_id`, `part_index` (1-based, unique per recording), `audio_path`, `status` (`uploading`/`queued`/`transcribing`/`transcribed`/`failed`), `provider_id` (reserved), `transcript` jsonb (utterances: speaker + start/end ms + text), `duration_s` |
| `recording_notes` | Fathom output, 1:1 | `recording_id` pk, `tldr`, `topics` jsonb `[{title,summary,start_ms,part_index}]`, `action_items` jsonb, `highlights` jsonb `[{quote,start_ms,part_index}]`, `model`, `generated_at` |
| `authored_questions` *(Phase 3)* | educator/AI-drafted Qs | `recording_id?`, `course_id`, `position`, `stem`, `choices`, `correct_answer`, `rationale?`, `status` (`draft`/`published`) |

- Stitched full transcript is **assembled on read** (client/view) from
  `recording_parts` ordered by `part_index` — not stored twice.
- RLS: owner-only SELECT/INSERT/UPDATE on all three; admin read for audit.
- `assignments.source_recording_id` (nullable FK) links a generated quiz back
  to its recording.
- Storage path: `recordings/{owner_id}/{recording_id}/part-{n}.{ext}`; bucket
  RLS = `owner_id = auth.uid() OR is_admin`.

## Backend — edge functions

All three call Gemini with structured-JSON output (same key as transcription).

| Function | Auth | Job |
|---|---|---|
| `transcribe-part` | user JWT | Set Part `transcribing`, then (background via `EdgeRuntime.waitUntil`) download the audio and send it to **Gemini** (inline ≤18 MB, else the Files API) for a speaker-labelled JSON transcript; write `recording_parts.transcript`, set `transcribed`, and flip the recording to `ready` once every Part has settled. Synchronous per Part — no webhook. |
| `summarize-recording` *(Phase 2)* | user/internal | Stitch transcript, Gemini → `recording_notes` (structured JSON). |
| `generate-quiz-from-recording` *(Phase 3)* | user JWT | Gemini drafts `authored_questions` (status `draft`) from transcript/notes. |

Secrets to set (owner action): `GEMINI_API_KEY` (Google AI Studio, paid tier);
optional `GEMINI_MODEL` (default `gemini-2.5-flash`). One key powers transcription, notes, AND quiz — no Anthropic key needed.

## Publish design (Phase 3b)

**Isolated parts BUILT + staged (not deployed)** as of 2026-06-12:
`0218_authored_attempts.sql` (file, not pushed) — `authored_questions.assignment_id`
snapshot column + `get_authored_questions` (answer-stripped reader) +
`submit_authored_attempt` (server-graded, idempotent); and dormant
`AuthoredQuizRunner.tsx` (built, not wired/routed). `tsc -b` clean.
**STILL DEFERRED** (the shared-assignment collision surface): the
`assignments_kind_consistency` ALTER to allow `'authored_set'`,
`publish_authored_quiz`, the `QuizDraftPanel` Publish wiring, and the
one-line `AssignmentRunner` branch — to be done once the parallel assignment
rework settles.

How a reviewed draft quiz becomes a **student-takeable assignment**. Chosen
shape: a new lightweight assignment kind that reuses the stable shared tables
(`assignments`, `assignment_attempts`, `module_items`, memberships) and a
dedicated runner — so it stays OUT of the full-test/qbank machinery the
parallel session is actively rewriting.

**Data**
- New `assignments.kind = 'authored_set'`. Requires altering the
  `assignments_kind_consistency` CHECK (0045) — the one shared-constraint
  collision point with the parallel assignment work; the ALTER is targeted
  (adds a third allowed kind; `authored_set` carries neither `source_id` nor
  `qbank_set_uid`, and keeps `source_recording_id`).
- Add `authored_questions.assignment_id` (nullable FK). **Publish snapshots**:
  copies the recording's current draft rows into new rows with
  `assignment_id` set + `status='published'`. Drafts stay editable for a later
  re-publish; a live quiz never changes under a student mid-flight.

**RPCs (SECURITY DEFINER, stable error codes, mirror `submit_qbank_attempt`)**
- `publish_authored_quiz(p_recording_id, p_course_id, p_title, p_module_id?)`
  — owner + teacher-of-course gated; snapshots questions, inserts the
  `assignments` row (+ optional `module_items` link), returns assignment id.
- `get_authored_questions(p_assignment_id)` — enrolled-student reader that
  returns stem + choices but **NOT `correct_answer`** (the table is owner-only
  RLS, so students can't read it directly; this is the gated, answer-stripped
  view).
- `submit_authored_attempt(p_assignment_id, p_client_attempt_id, p_answers)`
  — **server-side grades** against `authored_questions.correct_answer` (client
  never sends a score), idempotent on client_attempt_id, writes
  `assignment_attempts`. Mirrors the qbank submit's validation.

**Client**
- `QuizDraftPanel` Publish button → pick a course (Combobox of the educator's
  courses) + optional module → `publish_authored_quiz`.
- New `AuthoredQuizRunner.tsx`; one additive branch in `AssignmentRunner`
  (`kind === 'authored_set'`). Published quizzes then appear in the normal
  course Assignments / Modules surfaces like any assignment.

**Why deferred / build-timing**: altering the shared kind CHECK + touching
`AssignmentRunner` / `useStudentAssignments` while the parallel session churns
migrations 0210–0217 risks real conflicts. Safest to build once their
assignment rework settles, or in explicit coordination.

## Client — `viewer/src/recordings/`

- **RecordingsListPage** — owner's recordings with **search**, status filter
  (all/ready/processing), relative time + duration + subject, per-row **kebab**
  (rename inline / delete), and **auto-refresh while anything is processing**.
  Skeleton + empty-state CTA. "New recording" modal (`ResponsiveModal`): title,
  subject self/session + consent gate, or `FileDropzone` upload (= one-Part rec).
- **RecorderPanel** — MediaRecorder; Record / Pause / Stop-Part / End; live
  **mic level meter** + per-Part timer; consent already gated at creation.
- **RecordingDetailPage** — **Fathom layout**: notes-first (TL;DR / Topics /
  Action items / Highlights with **jump-to-timestamp** chips that expand the
  transcript + seek the audio), then a **collapsible, searchable Full
  Transcript** (collapses once notes exist). Owner can **rename speakers**
  (across Parts), **inline-correct** any utterance, **edit the AI notes**
  (TL;DR / topic title+summary / action items inline; remove topics + highlights;
  add action items), and **retry or delete a Part** (delete renumbers). Header
  actions: **Copy notes**, **Copy transcript**, **Download .md**,
  Generate/Regenerate notes, Delete. Per-Part audio playback + status.
- **QuizDraftPanel** — generate (SAT-style/general toggle) → review/edit each
  question (stem/choices/correct/rationale) → delete/regenerate. Publish button
  present but disabled (Phase 3b deferred).
- **AuthoredQuizRunner** *(dormant)* — built student MCQ runner, not yet wired.
- **format.ts** — pure helpers: `relativeTime`, `formatDuration`, `fmtTs`,
  `speakerDisplay`, `transcriptToText`, `recordingToMarkdown`, `downloadText`.

Reuse: `useToast`, `Skeleton`/`SkeletonRows`, `FileDropzone`, `KebabMenu`,
`ResponsiveModal`, `EmptyState`, role vocab from `lib/domain.ts`. Transcript /
speaker edits persist to `recording_parts.transcript` via `updatePartTranscript`
/ `renameSpeaker` (owner RLS; validated round-trip on prod).

## Known risks

- **iOS/Safari MediaRecorder**: codec support is uneven (webm/opus unsupported on
  Safari). Feature-detect `MediaRecorder.isTypeSupported` (prefer `audio/mp4`/AAC,
  fall back to `audio/webm`); the upload path is the safety net. Must test on iOS.
- **Latency**: transcription is async, not instant. Part-by-Part processing gives
  incremental feedback; UI must show per-Part progress, never a dead spinner.
- **Speaker labels & timestamps**: Gemini's diarization + time estimates are
  rougher than a dedicated STT (AssemblyAI). Good enough for notes; if precise
  word-level timestamps matter later, AssemblyAI is a drop-in alternative.
- **Large uploads**: Parts >18 MB go through the Gemini Files API (handled);
  very long single uploads still cost more latency than short Parts.
- **Cost**: a few ¢ / recorded hour (Gemini paid tier) + a few ¢ Gemini per
  summary/quiz. Per-use, modest, but real — consider a retention policy as audio
  storage grows.
- **Authored questions are net-new infra** (no existing teacher-authoring path) —
  the largest unknown; isolated to Phase 3.

## Phases

- **Phase 0 — Foundations**: migration (tables + RLS + audit trigger + bucket),
  secrets, route/domain gating. Smoke green, `tsc -b` clean.
- **Phase 1 — Capture + transcribe** *(core value)*: RecorderPanel with Parts +
  upload; `transcribe-part` (Gemini, background); list/detail showing stitched
  per-Part transcripts with speaker labels + Part dividers.
- **Phase 2 — Fathom notes**: `summarize-recording` (Gemini) + notes UI with
  jump-to-timestamp playback.
- **Phase 3 — Generate quiz/assignment**: `authored_questions` model + Gemini
  draft → review/edit → publish.
- **Phase 4 — Polish**: counseling consent/audit hardening, coach-domain wiring,
  retention, iOS fallback hardening.

## Owner actions needed before transcription works

1. Create a **Google AI Studio** API key (paid tier for no-training privacy);
   `supabase secrets set GEMINI_API_KEY=…`.
2. Confirm the **consent / recording-of-minors policy** the `session` checkbox
   asserts, plus retention/deletion expectations.
