// persistence.js — Shared attempt persistence layer for the SAT Question Bank
// exports. Both the per-set test-runner and the index page consume the same
// interface so that a single source of truth backs every "your progress"
// surface, whether that source is localStorage (offline / signed-out) or
// Supabase (signed-in).
//
// CONTRACT (DO NOT CHANGE WITHOUT MIGRATING ALL CONSUMERS):
//   Persistence.saveDraft(setUid, draft)
//   Persistence.loadDraft(setUid) -> draft | null       (sync-or-async)
//   Persistence.clearDraft(setUid)
//   Persistence.saveAttempt(setUid, attempt) -> Promise<void>
//   Persistence.listLatestAttempts() -> Promise<Array<{ setUid, attempt }>>
//   Persistence.listInProgress() -> Promise<Array<{ setUid, draft }>>
//   Persistence.clearForSet(setUid) -> Promise<void>
//   Persistence.clearAll() -> Promise<void>
//
// Adapter selection (DESIGN_ARCH.md §4.2):
//   - LocalStorageAdapter is the default + permanent fallback.
//   - SupabaseAdapter activates iff <meta name="supabase-url"> +
//     <meta name="supabase-anon"> are present AND a Supabase auth session
//     exists AND we can reach the REST endpoint.
//   - On sign-in, a one-way migration pushes local data UP to Supabase and
//     deletes the local keys (guarded by a per-user flag). DB is authoritative
//     from then on; we never pull DB rows back into localStorage.
//   - Offline (navigator.onLine === false) → fall back to localStorage for
//     the rest of the session. When connectivity returns, the next pageload
//     re-runs migration to drain whatever queued there.
//
// The two adapter handles are exported on `window`:
//   - window.__persistence         : the resolved adapter (sync, set after
//                                     pickAdapter() resolves)
//   - window.__persistencePromise  : a Promise that resolves to the adapter,
//                                     for callers that need to wait
//   - window.Persistence           : alias of window.__persistence
//   - window.__persistenceAdapter  : legacy escape hatch — assign BEFORE this
//                                     script runs to force a custom adapter
//                                     (matches the original W1 contract).
//
// Storage layout (localStorage, used by LocalStorageAdapter only):
//   sat-qb-attempt:<setUid>                 → in-progress draft (JSON)
//   sat-qb-attempt-done:<setUid>:<ts>       → completed attempt (JSON)
//   sat-qb-attempt-index                    → JSON array of all keys above
//   sat-qb-migrated:<userId>                → migration-done flag

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // LocalStorageAdapter (unchanged W1 contract — locked).
  // ---------------------------------------------------------------------------

  var DRAFT_PREFIX = 'sat-qb-attempt:';
  var DONE_PREFIX  = 'sat-qb-attempt-done:';
  var INDEX_KEY    = 'sat-qb-attempt-index';
  var MIGRATED_FLAG_PREFIX = 'sat-qb-migrated:';

  function ls() {
    try { return global.localStorage; } catch (e) { return null; }
  }

  function readJSON(key) {
    var s = ls();
    if (!s) return null;
    try {
      var raw = s.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    var s = ls();
    if (!s) return;
    try { s.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function removeKey(key) {
    var s = ls();
    if (!s) return;
    try { s.removeItem(key); } catch (e) {}
  }

  function readIndex() {
    var idx = readJSON(INDEX_KEY);
    return Array.isArray(idx) ? idx : [];
  }
  function addToIndex(key) {
    var idx = readIndex();
    if (idx.indexOf(key) === -1) {
      idx.push(key);
      writeJSON(INDEX_KEY, idx);
    }
  }
  function removeFromIndex(key) {
    var idx = readIndex();
    var i = idx.indexOf(key);
    if (i !== -1) {
      idx.splice(i, 1);
      writeJSON(INDEX_KEY, idx);
    }
  }

  var LocalStorageAdapter = {
    __name: 'localStorage',
    saveDraft: function (setUid, draft) {
      if (!setUid) return;
      var key = DRAFT_PREFIX + setUid;
      writeJSON(key, draft);
      addToIndex(key);
    },
    loadDraft: function (setUid) {
      if (!setUid) return null;
      return readJSON(DRAFT_PREFIX + setUid);
    },
    clearDraft: function (setUid) {
      if (!setUid) return;
      var key = DRAFT_PREFIX + setUid;
      removeKey(key);
      removeFromIndex(key);
    },
    saveAttempt: function (setUid, attempt) {
      if (!setUid || !attempt) return Promise.resolve();
      var ts = attempt.submittedAt || Date.now();
      var key = DONE_PREFIX + setUid + ':' + ts;
      writeJSON(key, attempt);
      addToIndex(key);
      // After a successful submit, clear the in-progress draft.
      LocalStorageAdapter.clearDraft(setUid);
      return Promise.resolve();
    },
    listLatestAttempts: function () {
      var idx = readIndex();
      var latest = Object.create(null);
      for (var i = 0; i < idx.length; i++) {
        var key = idx[i];
        if (key.indexOf(DONE_PREFIX) !== 0) continue;
        var rest = key.slice(DONE_PREFIX.length);
        var sep = rest.lastIndexOf(':');
        if (sep < 0) continue;
        var setUid = rest.slice(0, sep);
        var ts = parseInt(rest.slice(sep + 1), 10);
        if (isNaN(ts)) continue;
        if (!latest[setUid] || ts > latest[setUid].ts) {
          var attempt = readJSON(key);
          if (attempt) latest[setUid] = { ts: ts, attempt: attempt };
        }
      }
      var out = [];
      for (var uid in latest) {
        if (Object.prototype.hasOwnProperty.call(latest, uid)) {
          out.push({ setUid: uid, attempt: latest[uid].attempt });
        }
      }
      return Promise.resolve(out);
    },
    listInProgress: function () {
      var idx = readIndex();
      var out = [];
      for (var i = 0; i < idx.length; i++) {
        var key = idx[i];
        if (key.indexOf(DRAFT_PREFIX) !== 0) continue;
        var setUid = key.slice(DRAFT_PREFIX.length);
        var draft = readJSON(key);
        if (draft) out.push({ setUid: setUid, draft: draft });
      }
      return Promise.resolve(out);
    },
    clearForSet: function (setUid) {
      if (!setUid) return Promise.resolve();
      var idx = readIndex();
      var toRemove = [];
      for (var i = 0; i < idx.length; i++) {
        var key = idx[i];
        if (
          key === DRAFT_PREFIX + setUid ||
          key.indexOf(DONE_PREFIX + setUid + ':') === 0
        ) {
          removeKey(key);
          toRemove.push(key);
        }
      }
      if (toRemove.length) {
        var next = idx.filter(function (k) { return toRemove.indexOf(k) === -1; });
        writeJSON(INDEX_KEY, next);
      }
      return Promise.resolve();
    },
    clearAll: function () {
      var idx = readIndex();
      for (var i = 0; i < idx.length; i++) removeKey(idx[i]);
      removeKey(INDEX_KEY);
      return Promise.resolve();
    },
  };

  // ---------------------------------------------------------------------------
  // SupabaseAdapter — same shape, backed by the `test_attempts` /
  // `test_answers` tables from migration 0042. Same-origin only: the SAT
  // export pages must be served from the same origin as the viewer so the
  // Supabase JS client picks up the existing auth session from localStorage.
  // ---------------------------------------------------------------------------

  function metaContent(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    if (!el) return '';
    var v = el.getAttribute('content');
    return v ? String(v).trim() : '';
  }

  function hasSupabaseConfig() {
    return !!(metaContent('supabase-url') && metaContent('supabase-anon'));
  }

  // Lazy-load supabase-js from a CDN so the static exports stay
  // dependency-free at install time. The viewer's bundled client is a
  // SEPARATE instance — we don't try to share it, we just share the auth
  // session via localStorage (same origin → same storage).
  var _clientPromise = null;
  function getClient() {
    if (_clientPromise) return _clientPromise;
    if (!hasSupabaseConfig()) {
      _clientPromise = Promise.resolve(null);
      return _clientPromise;
    }
    _clientPromise = (async function () {
      try {
        var mod = await import('https://esm.sh/@supabase/supabase-js@2');
        var createClient = mod.createClient;
        return createClient(metaContent('supabase-url'), metaContent('supabase-anon'), {
          auth: {
            // Use the SAME storage key as the viewer so we ride along on its
            // session without competing for it.
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        });
      } catch (e) {
        // CDN unreachable / blocked / offline — propagate null so the
        // selector falls back to LocalStorageAdapter.
        try { console.warn('[persistence] supabase-js load failed:', e && e.message); } catch (_) {}
        return null;
      }
    })();
    return _clientPromise;
  }

  // In-memory cache of the current (attempt_id, set_uid) draft mapping. Saves
  // a roundtrip on rapid saveDraft() calls and lets debouncing work.
  var _draftCache = Object.create(null);   // setUid -> { id, answers, startedAt }
  var _saveTimers = Object.create(null);    // setUid -> setTimeout handle
  var _pendingPayload = Object.create(null); // setUid -> latest draft
  var DRAFT_SAVE_DEBOUNCE_MS = 800;

  // Track the user_id once we've resolved it so listLatestAttempts /
  // listInProgress can RLS-filter without a roundtrip.
  var _userId = null;

  async function currentUserId(client) {
    if (_userId) return _userId;
    try {
      var s = await client.auth.getSession();
      var uid = s && s.data && s.data.session && s.data.session.user && s.data.session.user.id;
      _userId = uid || null;
      return _userId;
    } catch (e) {
      return null;
    }
  }

  // Build the answer rows for a given attempt id from a draft. Phase-2:
  // pacing fields (time_spent_ms, revisit_count) are carried so server-side
  // analytics can read live progress without waiting for full submission.
  function answerRowsFromDraft(attemptId, draft) {
    var out = [];
    var ans = (draft && draft.answers) || {};
    var ts = (draft && draft.timeSpent) || {};
    var vs = (draft && draft.visits) || {};
    // Union of qids that have either an answer OR an accumulated time/visit
    // count — a question can have been visited but skipped, and we still
    // want to capture that pacing data.
    var seen = Object.create(null);
    for (var k1 in ans) if (Object.prototype.hasOwnProperty.call(ans, k1)) seen[k1] = true;
    for (var k2 in ts)  if (Object.prototype.hasOwnProperty.call(ts, k2))  seen[k2] = true;
    for (var k3 in vs)  if (Object.prototype.hasOwnProperty.call(vs, k3))  seen[k3] = true;
    for (var qid in seen) {
      out.push({
        attempt_id: attemptId,
        question_id: qid,
        chosen: ans[qid] == null ? null : String(ans[qid]),
        is_correct: null,
        answer_time_ms: null,
        time_spent_ms: ts[qid] == null ? null : Number(ts[qid]),
        revisit_count: vs[qid] == null ? null : Number(vs[qid]),
      });
    }
    return out;
  }

  function answerRowsFromAttempt(attemptId, attempt) {
    var out = [];
    var arr = (attempt && attempt.answers) || [];
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      out.push({
        attempt_id: attemptId,
        question_id: a.qid,
        chosen: a.chosen == null ? null : String(a.chosen),
        is_correct: !!a.isCorrect,
        // Phase-1 column kept for back-compat; Phase-2 columns added.
        answer_time_ms: a.answerTimeMs == null ? null : Number(a.answerTimeMs),
        time_spent_ms: a.answerTimeMs == null ? null : Number(a.answerTimeMs),
        revisit_count: a.revisitCount == null ? null : Number(a.revisitCount),
      });
    }
    return out;
  }

  // Pick out the auxiliary draft fields that live in the JSONB draft_meta
  // column on test_attempts. Keeping them off the wire-format of the
  // saveDraft answer rows means a partial DB schema (Phase-1 only) still
  // works — these fields just round-trip as null until 0043 is applied.
  // 0044 introduces top-level `highlights` + `notes` columns for SUBMITTED
  // rows; for drafts we keep the same data inside draft_meta so a
  // pre-0044 environment still round-trips them transparently.
  function draftMetaFromDraft(draft) {
    return {
      marked: (draft && draft.marked) || {},
      crossOut: (draft && draft.crossOut) || {},
      currentIndex: (draft && Number.isFinite(draft.currentIndex)) ? draft.currentIndex : 0,
      timeSpent: (draft && draft.timeSpent) || {},
      visits: (draft && draft.visits) || {},
      highlights: (draft && draft.highlights) || {},
      notes: (draft && draft.notes) || {},
    };
  }

  // Find (or create) the unique in-progress attempt row for a given setUid.
  async function ensureDraftRow(client, userId, setUid, startedAt) {
    if (_draftCache[setUid] && _draftCache[setUid].id) {
      return _draftCache[setUid].id;
    }
    // Try to find an existing draft row.
    var existing = await client
      .from('test_attempts')
      .select('id, started_at')
      .eq('user_id', userId)
      .eq('set_uid', setUid)
      .is('submitted_at', null)
      .maybeSingle();
    if (existing && existing.data && existing.data.id) {
      _draftCache[setUid] = _draftCache[setUid] || {};
      _draftCache[setUid].id = existing.data.id;
      return existing.data.id;
    }
    // Insert a fresh draft. The unique partial index guarantees at most one.
    var inserted = await client
      .from('test_attempts')
      .insert({
        user_id: userId,
        set_uid: setUid,
        started_at: new Date(startedAt || Date.now()).toISOString(),
        source: 'static',
      })
      .select('id')
      .single();
    if (inserted.error) throw inserted.error;
    _draftCache[setUid] = _draftCache[setUid] || {};
    _draftCache[setUid].id = inserted.data.id;
    return inserted.data.id;
  }

  // Flush a debounced draft save for one setUid.
  async function flushDraft(setUid) {
    var draft = _pendingPayload[setUid];
    if (!draft) return;
    delete _pendingPayload[setUid];
    var client = await getClient();
    if (!client) return;
    var uid = await currentUserId(client);
    if (!uid) return;
    try {
      var attemptId = await ensureDraftRow(client, uid, setUid, draft.startedAt);

      // Write draft_meta (JSONB) for the auxiliary fields. Best-effort:
      // if the column doesn't exist (pre-0043 environment) Postgrest will
      // 400; we swallow that so the rest of the save still goes through.
      try {
        var meta = draftMetaFromDraft(draft);
        var updMeta = await client
          .from('test_attempts')
          .update({ draft_meta: meta })
          .eq('id', attemptId);
        if (updMeta.error) {
          try { console.warn('[persistence] draft_meta update skipped:', updMeta.error.message); } catch (_) {}
        }
      } catch (_) {}

      // Replace the answer rows wholesale — drafts are tiny and the
      // delete+insert keeps "answer removed by user" semantics correct.
      var del = await client.from('test_answers').delete().eq('attempt_id', attemptId);
      if (del.error) throw del.error;
      var rows = answerRowsFromDraft(attemptId, draft);
      if (rows.length) {
        var ins = await client.from('test_answers').insert(rows);
        if (ins.error) {
          // Phase-2 columns may not exist yet — retry with the legacy shape.
          var legacy = rows.map(function (r) {
            return {
              attempt_id: r.attempt_id,
              question_id: r.question_id,
              chosen: r.chosen,
              is_correct: r.is_correct,
              answer_time_ms: r.answer_time_ms,
            };
          });
          var insLegacy = await client.from('test_answers').insert(legacy);
          if (insLegacy.error) throw insLegacy.error;
        }
      }
    } catch (e) {
      try { console.warn('[persistence] saveDraft failed:', e && e.message); } catch (_) {}
    }
  }

  var SupabaseAdapter = {
    __name: 'supabase',
    isAvailable: async function () {
      if (!hasSupabaseConfig()) return false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
      var client = await getClient();
      if (!client) return false;
      // Session must exist — otherwise we'd be writing nothing (RLS would
      // reject) and might as well use localStorage.
      var uid = await currentUserId(client);
      if (!uid) return false;
      // Light ping: a HEAD-style select against test_attempts. Failure here
      // (network, RLS misconfig, missing table) → fall back to local.
      try {
        var ping = await client
          .from('test_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .limit(1);
        if (ping.error) return false;
      } catch (e) {
        return false;
      }
      return true;
    },

    saveDraft: function (setUid, draft) {
      if (!setUid || !draft) return;
      // Cache + debounce. Always retain the latest draft snapshot so a flush
      // writes the most recent state. Phase-2: include the full draft shape
      // so timing + UI flags round-trip. v3: highlights + notes ride along
      // through draft_meta (JSONB) — no separate columns for drafts.
      _pendingPayload[setUid] = {
        answers: Object.assign({}, draft.answers || {}),
        marked: Object.assign({}, draft.marked || {}),
        crossOut: Object.assign({}, draft.crossOut || {}),
        currentIndex: Number.isFinite(draft.currentIndex) ? draft.currentIndex : 0,
        timeSpent: Object.assign({}, draft.timeSpent || {}),
        visits: Object.assign({}, draft.visits || {}),
        highlights: Object.assign({}, draft.highlights || {}),
        notes: Object.assign({}, draft.notes || {}),
        startedAt: draft.startedAt || Date.now(),
      };
      if (_saveTimers[setUid]) clearTimeout(_saveTimers[setUid]);
      _saveTimers[setUid] = setTimeout(function () {
        delete _saveTimers[setUid];
        flushDraft(setUid);
      }, DRAFT_SAVE_DEBOUNCE_MS);
    },

    // Sync return signature matches LocalStorageAdapter: returns the cached
    // draft if we have one, otherwise null. The async loader kicks off in the
    // background and updates the cache for next read. Consumers that want to
    // wait for the DB lookup can use `loadDraftAsync` below.
    loadDraft: function (setUid) {
      if (!setUid) return null;
      var c = _draftCache[setUid];
      if (c && c.answers) {
        return {
          answers: c.answers,
          marked: c.marked || {},
          crossOut: c.crossOut || {},
          currentIndex: Number.isFinite(c.currentIndex) ? c.currentIndex : 0,
          timeSpent: c.timeSpent || {},
          visits: c.visits || {},
          highlights: c.highlights || {},
          notes: c.notes || {},
          startedAt: c.startedAt,
        };
      }
      // Kick off async load to warm the cache; intentionally fire-and-forget.
      SupabaseAdapter.loadDraftAsync(setUid).catch(function () {});
      return null;
    },

    loadDraftAsync: async function (setUid) {
      if (!setUid) return null;
      var client = await getClient();
      if (!client) return null;
      var uid = await currentUserId(client);
      if (!uid) return null;
      // Try the Phase-2 schema first (draft_meta column); fall back to the
      // Phase-1 shape if the column is missing.
      var attCols = 'id, started_at, draft_meta';
      var att = await client
        .from('test_attempts')
        .select(attCols)
        .eq('user_id', uid)
        .eq('set_uid', setUid)
        .is('submitted_at', null)
        .maybeSingle();
      if (att.error) {
        // Likely "column does not exist" on pre-0043 environments. Retry
        // without draft_meta so we still return what we can.
        att = await client
          .from('test_attempts')
          .select('id, started_at')
          .eq('user_id', uid)
          .eq('set_uid', setUid)
          .is('submitted_at', null)
          .maybeSingle();
        if (att.error || !att.data) return null;
      } else if (!att.data) {
        return null;
      }
      var answers = await client
        .from('test_answers')
        .select('question_id, chosen, time_spent_ms, revisit_count')
        .eq('attempt_id', att.data.id);
      if (answers.error) {
        // Retry without Phase-2 columns.
        answers = await client
          .from('test_answers')
          .select('question_id, chosen')
          .eq('attempt_id', att.data.id);
        if (answers.error) return null;
      }
      var ansMap = Object.create(null);
      var tsMap = Object.create(null);
      var vsMap = Object.create(null);
      for (var i = 0; i < answers.data.length; i++) {
        var r = answers.data[i];
        if (r.chosen != null) ansMap[r.question_id] = r.chosen;
        if (r.time_spent_ms != null) tsMap[r.question_id] = Number(r.time_spent_ms);
        if (r.revisit_count != null) vsMap[r.question_id] = Number(r.revisit_count);
      }
      var startedAt = att.data.started_at
        ? new Date(att.data.started_at).getTime()
        : Date.now();
      var meta = (att.data.draft_meta && typeof att.data.draft_meta === 'object')
        ? att.data.draft_meta
        : {};
      // Per-answer time/visits trump draft_meta (they're the canonical
      // server-side source) but draft_meta fills in any gaps.
      var ts = Object.assign({}, meta.timeSpent || {}, tsMap);
      var vs = Object.assign({}, meta.visits || {}, vsMap);
      _draftCache[setUid] = {
        id: att.data.id,
        answers: ansMap,
        marked: meta.marked || {},
        crossOut: meta.crossOut || {},
        currentIndex: Number.isFinite(meta.currentIndex) ? meta.currentIndex : 0,
        timeSpent: ts,
        visits: vs,
        highlights: (meta.highlights && typeof meta.highlights === 'object') ? meta.highlights : {},
        notes: (meta.notes && typeof meta.notes === 'object') ? meta.notes : {},
        startedAt: startedAt,
      };
      return {
        answers: ansMap,
        marked: meta.marked || {},
        crossOut: meta.crossOut || {},
        currentIndex: Number.isFinite(meta.currentIndex) ? meta.currentIndex : 0,
        timeSpent: ts,
        visits: vs,
        highlights: (meta.highlights && typeof meta.highlights === 'object') ? meta.highlights : {},
        notes: (meta.notes && typeof meta.notes === 'object') ? meta.notes : {},
        startedAt: startedAt,
      };
    },

    clearDraft: function (setUid) {
      if (!setUid) return;
      // Cancel any debounced save first.
      if (_saveTimers[setUid]) { clearTimeout(_saveTimers[setUid]); delete _saveTimers[setUid]; }
      delete _pendingPayload[setUid];
      var cached = _draftCache[setUid];
      delete _draftCache[setUid];
      // Async fire-and-forget delete. RLS scopes to current user automatically.
      (async function () {
        try {
          var client = await getClient();
          if (!client) return;
          var uid = await currentUserId(client);
          if (!uid) return;
          if (cached && cached.id) {
            await client.from('test_attempts').delete().eq('id', cached.id);
          } else {
            await client.from('test_attempts').delete()
              .eq('user_id', uid)
              .eq('set_uid', setUid)
              .is('submitted_at', null);
          }
        } catch (_) {}
      })();
    },

    saveAttempt: async function (setUid, attempt) {
      if (!setUid || !attempt) return;
      var client = await getClient();
      if (!client) throw new Error('supabase client unavailable');
      var uid = await currentUserId(client);
      if (!uid) throw new Error('not authenticated');

      // Cancel any debounced draft save — submission supersedes it.
      if (_saveTimers[setUid]) { clearTimeout(_saveTimers[setUid]); delete _saveTimers[setUid]; }
      delete _pendingPayload[setUid];

      // Use the existing draft row if we have one (so the same attempt id is
      // promoted from draft to submitted, preserving FK rows). Otherwise insert.
      var attemptId = (_draftCache[setUid] && _draftCache[setUid].id) || null;
      if (!attemptId) {
        var found = await client
          .from('test_attempts')
          .select('id')
          .eq('user_id', uid)
          .eq('set_uid', setUid)
          .is('submitted_at', null)
          .maybeSingle();
        attemptId = (found && found.data && found.data.id) || null;
      }

      var startedAtIso = new Date(attempt.startedAt || Date.now()).toISOString();
      var submittedAtIso = new Date(attempt.submittedAt || Date.now()).toISOString();
      var common = {
        user_id: uid,
        set_uid: setUid,
        started_at: startedAtIso,
        submitted_at: submittedAtIso,
        seconds_taken: attempt.secondsTaken == null ? null : Number(attempt.secondsTaken),
        score: attempt.score == null ? null : Number(attempt.score),
        total: attempt.total == null ? null : Number(attempt.total),
        source: attempt.source === 'viewer' ? 'viewer' : 'static',
      };
      // 0044: persist final highlights + notes on the submitted row so they
      // survive the draft-clear that happens on submit. We only attach these
      // when the payload actually carries them — keeps pre-0044 environments
      // happy via the retry fallback below.
      var withAnnotations = Object.assign({}, common, {
        highlights: attempt.highlights && typeof attempt.highlights === 'object'
          ? attempt.highlights
          : {},
        notes: attempt.notes && typeof attempt.notes === 'object'
          ? attempt.notes
          : {},
      });

      async function writeAttemptRow() {
        if (attemptId) {
          var upd = await client.from('test_attempts').update(withAnnotations).eq('id', attemptId);
          if (upd.error) {
            // Pre-0044: columns don't exist. Retry without annotations.
            try { console.warn('[persistence] saveAttempt annotations skipped:', upd.error.message); } catch (_) {}
            var updLegacy = await client.from('test_attempts').update(common).eq('id', attemptId);
            if (updLegacy.error) throw updLegacy.error;
          }
        } else {
          var ins = await client
            .from('test_attempts')
            .insert(withAnnotations)
            .select('id')
            .single();
          if (ins.error) {
            try { console.warn('[persistence] saveAttempt annotations skipped:', ins.error.message); } catch (_) {}
            var insLegacy = await client
              .from('test_attempts')
              .insert(common)
              .select('id')
              .single();
            if (insLegacy.error) throw insLegacy.error;
            attemptId = insLegacy.data.id;
          } else {
            attemptId = ins.data.id;
          }
        }
      }
      await writeAttemptRow();

      // Replace answer rows wholesale with the final (graded) set.
      var del = await client.from('test_answers').delete().eq('attempt_id', attemptId);
      if (del.error) throw del.error;
      var rows = answerRowsFromAttempt(attemptId, attempt);
      if (rows.length) {
        var insA = await client.from('test_answers').insert(rows);
        if (insA.error) {
          // Phase-2 columns might be missing — retry with the legacy schema.
          var legacy = rows.map(function (r) {
            return {
              attempt_id: r.attempt_id,
              question_id: r.question_id,
              chosen: r.chosen,
              is_correct: r.is_correct,
              answer_time_ms: r.answer_time_ms,
            };
          });
          var insLegacy = await client.from('test_answers').insert(legacy);
          if (insLegacy.error) throw insLegacy.error;
        }
      }

      // The attempt is no longer a draft — clear the in-memory cache so the
      // next saveDraft() for this setUid creates a fresh row.
      delete _draftCache[setUid];
    },

    listLatestAttempts: async function () {
      var client = await getClient();
      if (!client) return [];
      var uid = await currentUserId(client);
      if (!uid) return [];
      // Pull all submitted attempts; collapse to latest per set_uid in JS.
      // (Postgres DISTINCT ON would be cleaner via RPC, but RLS + simple
      // select keeps the schema light.)
      var res = await client
        .from('test_attempts')
        .select('set_uid, started_at, submitted_at, seconds_taken, score, total, source')
        .eq('user_id', uid)
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false });
      if (res.error) return [];
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < res.data.length; i++) {
        var r = res.data[i];
        if (seen[r.set_uid]) continue;
        seen[r.set_uid] = true;
        out.push({
          setUid: r.set_uid,
          attempt: {
            startedAt: r.started_at ? new Date(r.started_at).getTime() : null,
            submittedAt: r.submitted_at ? new Date(r.submitted_at).getTime() : null,
            secondsTaken: r.seconds_taken,
            score: r.score,
            total: r.total,
            source: r.source,
            // Answers omitted from the badge query — listLatestAttempts is
            // for the index page and only score/total/submittedAt are read.
            answers: [],
          },
        });
      }
      return out;
    },

    listInProgress: async function () {
      var client = await getClient();
      if (!client) return [];
      var uid = await currentUserId(client);
      if (!uid) return [];
      var res = await client
        .from('test_attempts')
        .select('id, set_uid, started_at, test_answers(question_id)')
        .eq('user_id', uid)
        .is('submitted_at', null);
      if (res.error) return [];
      var out = [];
      for (var i = 0; i < res.data.length; i++) {
        var r = res.data[i];
        var ansMap = Object.create(null);
        var rows = r.test_answers || [];
        for (var j = 0; j < rows.length; j++) {
          ansMap[rows[j].question_id] = true; // value not needed for count
        }
        out.push({
          setUid: r.set_uid,
          draft: {
            answers: ansMap,
            startedAt: r.started_at ? new Date(r.started_at).getTime() : Date.now(),
          },
        });
      }
      return out;
    },

    clearForSet: async function (setUid) {
      if (!setUid) return;
      if (_saveTimers[setUid]) { clearTimeout(_saveTimers[setUid]); delete _saveTimers[setUid]; }
      delete _pendingPayload[setUid];
      delete _draftCache[setUid];
      var client = await getClient();
      if (!client) return;
      var uid = await currentUserId(client);
      if (!uid) return;
      // ON DELETE CASCADE handles test_answers.
      await client.from('test_attempts')
        .delete()
        .eq('user_id', uid)
        .eq('set_uid', setUid);
    },

    clearAll: async function () {
      // Wipe all in-flight state.
      for (var k in _saveTimers) clearTimeout(_saveTimers[k]);
      _saveTimers = Object.create(null);
      _pendingPayload = Object.create(null);
      _draftCache = Object.create(null);
      var client = await getClient();
      if (!client) return;
      var uid = await currentUserId(client);
      if (!uid) return;
      await client.from('test_attempts').delete().eq('user_id', uid);
    },
  };

  // ---------------------------------------------------------------------------
  // One-way migration: localStorage → Supabase, on first sign-in.
  // Guarded by `sat-qb-migrated:<userId>` flag so it runs at most once per
  // user per browser. Never pulls DB data back into localStorage.
  // ---------------------------------------------------------------------------
  async function migrateLocalToSupabase(client) {
    var uid = await currentUserId(client);
    if (!uid) return;
    var flagKey = MIGRATED_FLAG_PREFIX + uid;
    try {
      if (ls() && ls().getItem(flagKey)) return; // already migrated
    } catch (_) {}

    var idx = readIndex();
    if (!idx.length) {
      // Nothing to migrate — still set the flag so we don't re-check on every page.
      try { ls() && ls().setItem(flagKey, String(Date.now())); } catch (_) {}
      return;
    }

    var movedKeys = [];

    // 1. Submitted attempts first (more important / immutable).
    for (var i = 0; i < idx.length; i++) {
      var key = idx[i];
      if (key.indexOf(DONE_PREFIX) !== 0) continue;
      var rest = key.slice(DONE_PREFIX.length);
      var sep = rest.lastIndexOf(':');
      if (sep < 0) continue;
      var setUid = rest.slice(0, sep);
      var attempt = readJSON(key);
      if (!attempt) continue;
      try {
        await SupabaseAdapter.saveAttempt(setUid, attempt);
        movedKeys.push(key);
      } catch (e) {
        try { console.warn('[persistence] migration of attempt failed:', setUid, e && e.message); } catch (_) {}
      }
    }

    // 2. Drafts second. saveDraft is debounced; we flush explicitly.
    for (var j = 0; j < idx.length; j++) {
      var dkey = idx[j];
      if (dkey.indexOf(DRAFT_PREFIX) !== 0) continue;
      var dSetUid = dkey.slice(DRAFT_PREFIX.length);
      var draft = readJSON(dkey);
      if (!draft) continue;
      try {
        _pendingPayload[dSetUid] = {
          answers: Object.assign({}, draft.answers || {}),
          marked: Object.assign({}, draft.marked || {}),
          crossOut: Object.assign({}, draft.crossOut || {}),
          currentIndex: Number.isFinite(draft.currentIndex) ? draft.currentIndex : 0,
          timeSpent: Object.assign({}, draft.timeSpent || {}),
          visits: Object.assign({}, draft.visits || {}),
          startedAt: draft.startedAt || Date.now(),
        };
        await flushDraft(dSetUid);
        movedKeys.push(dkey);
      } catch (e) {
        try { console.warn('[persistence] migration of draft failed:', dSetUid, e && e.message); } catch (_) {}
      }
    }

    // 3. Delete migrated local keys + set the per-user flag.
    if (movedKeys.length) {
      for (var k = 0; k < movedKeys.length; k++) {
        removeKey(movedKeys[k]);
        removeFromIndex(movedKeys[k]);
      }
    }
    try { ls() && ls().setItem(flagKey, String(Date.now())); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Adapter selector. Resolves once at module load. The chosen adapter is
  // assigned to both `__persistence` and `Persistence` (alias). Callers that
  // need to await the choice can use `__persistencePromise`.
  // ---------------------------------------------------------------------------
  async function pickAdapter() {
    // Legacy escape hatch — caller pre-assigned an adapter before this
    // script ran. Honour it without question.
    if (global.__persistenceAdapter) return global.__persistenceAdapter;
    if (!hasSupabaseConfig()) return LocalStorageAdapter;
    try {
      var ok = await SupabaseAdapter.isAvailable();
      if (!ok) return LocalStorageAdapter;
      // We're signed-in and online. Best-effort migration before flipping
      // the switch. Errors here don't block us — we still go DB-first.
      try {
        var client = await getClient();
        if (client) await migrateLocalToSupabase(client);
      } catch (_) {}
      // Pre-warm the draft cache for the CURRENT page's setUid (if any) so
      // the sync `loadDraft()` call in the test-runner's init() can return
      // the persisted draft on first paint. Without this prewarm, the resume
      // toast would only appear after a second navigation.
      try {
        var uidEl = document.querySelector('meta[name="set-uid"]');
        var setUid = uidEl && uidEl.getAttribute('content');
        if (setUid) await SupabaseAdapter.loadDraftAsync(setUid);
      } catch (_) {}
      return SupabaseAdapter;
    } catch (e) {
      return LocalStorageAdapter;
    }
  }

  var pickPromise = pickAdapter().then(function (adapter) {
    global.__persistence = adapter;
    global.Persistence = adapter;
    try {
      console.log('[persistence] adapter:', adapter.__name || 'custom');
    } catch (_) {}
    return adapter;
  }).catch(function (e) {
    global.__persistence = LocalStorageAdapter;
    global.Persistence = LocalStorageAdapter;
    try { console.warn('[persistence] adapter pick failed, falling back to localStorage:', e && e.message); } catch (_) {}
    return LocalStorageAdapter;
  });

  // Synchronous default so the first call-site doesn't crash before the
  // promise resolves. If Supabase ends up winning, `Persistence` is
  // re-pointed before any saveDraft happens (the test-runner gates its
  // first save behind a user interaction, which is well after page load).
  global.Persistence = global.__persistenceAdapter || LocalStorageAdapter;
  global.Persistence.__adapter = global.__persistenceAdapter ? 'custom' : 'localStorage';
  global.__persistence = global.Persistence;
  global.__persistencePromise = pickPromise;

  // Expose adapters for debugging / explicit selection.
  global.__persistenceAdapters = {
    localStorage: LocalStorageAdapter,
    supabase: SupabaseAdapter,
  };

  // ---------------------------------------------------------------------------
  // Offline / online transitions. We don't dynamically swap adapters in the
  // middle of a session (too easy to lose context); instead, on `online` we
  // re-run the migration so anything queued locally drains up to the DB.
  // ---------------------------------------------------------------------------
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', function () {
      if (!hasSupabaseConfig()) return;
      (async function () {
        try {
          var client = await getClient();
          if (!client) return;
          var uid = await currentUserId(client);
          if (!uid) return;
          // Reset the migrated flag if there's new local data since the
          // last migration (i.e. user wrote to localStorage while offline).
          if (readIndex().length) {
            try { ls() && ls().removeItem(MIGRATED_FLAG_PREFIX + uid); } catch (_) {}
            await migrateLocalToSupabase(client);
          }
        } catch (_) {}
      })();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
