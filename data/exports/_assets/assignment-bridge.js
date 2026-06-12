// assignment-bridge.js — LMS ↔ static-test-runner bridge.
//
// Loaded dynamically by test-runner.js whenever the page is opened with an
// `assignment_id` query parameter. Bulletproof submission strategy:
//
//   Channel 1 (iframe-direct): if the iframe page has a Supabase client of
//     its own (most builds do, via persistence.js), call submit_qbank_attempt
//     directly from inside the iframe. This survives the parent unmounting
//     mid-grade.
//
//   Channel 2 (parent postMessage): always also post the payload up to the
//     LMS parent, which runs its own exponential-backoff retry loop (see
//     qbankSubmit.ts → submitWithRetry).
//
// Both channels send the same `client_attempt_id`. The Lane A RPC dedups on
// that key, so even when both channels successfully reach the server, only
// one canonical attempt row exists.
//
// The bridge is a no-op when the page is opened without `assignment_id` —
// study mode and free-practice test mode continue to work as before.
(function (global) {
  'use strict';

  function getParams() {
    try {
      return new URLSearchParams(global.location.search);
    } catch (e) {
      return null;
    }
  }

  var params = getParams();
  if (!params || !params.has('assignment_id')) {
    return;
  }

  var ASSIGNMENT_ID = params.get('assignment_id') || '';
  // The parent generates client_attempt_id and threads it via URL so both
  // sides agree on the dedup key. Fall back to a fresh uuid only if absent
  // (e.g. someone navigates straight to the static page with an
  // assignment_id but no client_attempt_id — shouldn't happen in prod).
  function makeUuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
    } catch (_) {}
    return 'client-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }
  var CLIENT_ATTEMPT_ID =
    params.get('client_attempt_id') || params.get('attempt_id') || makeUuid();

  var iframeSubmitAttempted = false;

  // The server-side attempt uuid (from start_qbank_attempt). Distinct from
  // CLIENT_ATTEMPT_ID, which is the client dedup key. The parent (React runner)
  // calls start with its authenticated client and threads the uuid via URL; we
  // fall back to calling start ourselves if it's absent.
  var ATTEMPT_UUID = params.get('attempt_uuid') || null;

  function findIframeSupabase() {
    // persistence.js historically exposes its Supabase client a few different
    // ways depending on build. Probe each, fall back to null.
    try {
      if (global.SUPABASE_CLIENT && typeof global.SUPABASE_CLIENT.rpc === 'function') {
        return global.SUPABASE_CLIENT;
      }
    } catch (_) {}
    try {
      if (global.Persistence && global.Persistence._supabase &&
          typeof global.Persistence._supabase.rpc === 'function') {
        return global.Persistence._supabase;
      }
    } catch (_) {}
    try {
      if (global.supabase && typeof global.supabase.rpc === 'function') {
        return global.supabase;
      }
    } catch (_) {}
    return null;
  }

  function submitFromIframe(payload) {
    if (iframeSubmitAttempted) return;
    iframeSubmitAttempted = true;
    var sb = findIframeSupabase();
    if (!sb) return; // Parent retry chain will handle it.
    try {
      var promise = sb.rpc('submit_qbank_attempt', {
        p_assignment_id: ASSIGNMENT_ID,
        p_client_attempt_id: CLIENT_ATTEMPT_ID,
        p_payload: payload,
      });
      if (promise && typeof promise.then === 'function') {
        promise.then(
          function (res) {
            // Tell parent we succeeded so it can short-circuit its retry loop.
            try {
              global.parent.postMessage(
                { type: 'qbank_submit_done',
                  assignment_id: ASSIGNMENT_ID,
                  client_attempt_id: CLIENT_ATTEMPT_ID,
                  attempt_id: (res && res.data) || null },
                '*',
              );
            } catch (_) {}
          },
          function () {
            // Swallow — parent channel will retry with backoff.
          },
        );
      }
    } catch (e) {
      try { console.warn('[assignment-bridge] iframe submit threw', e); } catch (_) {}
    }
  }

  function postToParent(payload) {
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage(
          { type: 'qbank_submit',
            assignment_id: ASSIGNMENT_ID,
            client_attempt_id: CLIENT_ATTEMPT_ID,
            // Back-compat: older parent listeners may still read attempt_id.
            attempt_id: CLIENT_ATTEMPT_ID,
            payload: payload },
          '*',
        );
      }
    } catch (e) {
      try { console.warn('[assignment-bridge] postMessage failed', e); } catch (_) {}
    }
  }

  // Convert the static runner's attempt shape into the LMS payload contract.
  function buildPayload(attempt) {
    var answers = {};
    var detailAnswers = [];
    var correct = 0;
    var total = 0;
    if (attempt && Array.isArray(attempt.answers)) {
      total = attempt.answers.length;
      for (var i = 0; i < attempt.answers.length; i++) {
        var a = attempt.answers[i] || {};
        if (a.qid != null) answers[String(a.qid)] = String(a.chosen == null ? '' : a.chosen);
        if (a.isCorrect) correct++;
        detailAnswers.push({
          qid: a.qid,
          chosen: a.chosen,
          isCorrect: !!a.isCorrect,
          answerTimeMs: Number(a.answerTimeMs || 0),
          revisitCount: Number(a.revisitCount || 0),
        });
      }
    }
    var scoreCount = Number(attempt && attempt.score);
    if (!isFinite(scoreCount)) scoreCount = correct;
    var totalQ = Number(attempt && attempt.total) || total;
    var pct = totalQ > 0 ? (scoreCount / totalQ) * 100 : 0;

    var payload = {
      score_percent: Math.round(pct * 100) / 100,
      correct_count: scoreCount,
      total_questions: totalQ,
      answers: answers,
      result_detail: {
        seconds_taken: Number(attempt && attempt.secondsTaken) || 0,
        source: (attempt && attempt.source) || 'static',
        answers: detailAnswers,
        highlights: (attempt && attempt.highlights) || {},
        notes: (attempt && attempt.notes) || {},
      },
    };
    if (attempt && attempt.startedAt) {
      try { payload.started_at = new Date(attempt.startedAt).toISOString(); } catch (_) {}
    }
    return payload;
  }

  function installSaveAttemptHook() {
    if (!global.Persistence || typeof global.Persistence.saveAttempt !== 'function') return false;
    if (global.Persistence.__assignmentBridgeInstalled) return true;

    var original = global.Persistence.saveAttempt.bind(global.Persistence);
    global.Persistence.saveAttempt = function (setUid, attempt) {
      try {
        var payload = buildPayload(attempt);
        // Channel 1: iframe-direct (survives parent unmount).
        submitFromIframe(payload);
        // Channel 2: parent postMessage (parent runs exponential backoff).
        postToParent(payload);
      } catch (e) {
        try { console.warn('[assignment-bridge] submit dispatch failed', e); } catch (_) {}
      }
      // Preserve local persistence so the static results panel still renders.
      return original(setUid, attempt);
    };
    global.Persistence.__assignmentBridgeInstalled = true;
    return true;
  }

  // Persistence may not be loaded yet (test-runner.js loads it asynchronously
  // alongside this script). Poll up to ~8s before giving up silently.
  var tries = 0;
  function tryInstall() {
    if (installSaveAttemptHook()) return;
    tries++;
    if (tries > 80) return;
    setTimeout(tryInstall, 100);
  }
  tryInstall();

  // ---- Live monitoring (0214/0217): start an in-progress attempt + heartbeat
  //      so the teacher Monitor sees this student's current question + idle, the
  //      same as full tests. All best-effort; failures never affect the test.
  function currentQuestionNumber() {
    try {
      var cards = document.querySelectorAll('.card[data-qid]');
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].classList && cards[i].classList.contains('is-current')) return i + 1;
      }
    } catch (_) {}
    return null;
  }

  function heartbeat() {
    if (!ATTEMPT_UUID) return;
    var sb = findIframeSupabase();
    if (!sb) return;
    try {
      sb.rpc('assignment_heartbeat', {
        p_attempt_id: ATTEMPT_UUID,
        p_question: currentQuestionNumber(),
      });
    } catch (_) {}
  }

  var startTries = 0;
  function startAttempt() {
    // Parent already started it and gave us the uuid — just begin heartbeating.
    if (ATTEMPT_UUID) {
      if (global.AssignmentBridge) global.AssignmentBridge.attemptUuid = ATTEMPT_UUID;
      heartbeat();
      return;
    }
    var sb = findIframeSupabase();
    if (!sb) {
      // persistence.js / the supabase client may load slightly after us.
      startTries++;
      if (startTries <= 80) setTimeout(startAttempt, 150);
      return;
    }
    try {
      var p = sb.rpc('start_qbank_attempt', {
        p_assignment_id: ASSIGNMENT_ID,
        p_client_attempt_id: CLIENT_ATTEMPT_ID,
      });
      if (p && typeof p.then === 'function') {
        p.then(function (res) {
          if (res && res.data) {
            ATTEMPT_UUID = res.data;
            if (global.AssignmentBridge) global.AssignmentBridge.attemptUuid = ATTEMPT_UUID;
            heartbeat();
          }
        }, function () {});
      }
    } catch (_) {}
  }
  startAttempt();
  try {
    setInterval(heartbeat, 12000);
    document.addEventListener('click', function () { setTimeout(heartbeat, 50); }, true);
  } catch (_) {}

  // ---- Withhold gate (0209/0213): when the teacher withholds results, blank
  //      the static runner's results panel (score + pacing + per-question chart)
  //      with a friendly "not released yet" message. The durable record is
  //      already gated server-side; this hides the immediate in-iframe reveal.
  function installWithholdGate() {
    function blank(panel) {
      try {
        panel.innerHTML =
          '<header class="bluebook-results__header">' +
          '<h2 class="bluebook-results__title">Results not released yet</h2>' +
          '<div class="bluebook-results__eyebrow u-ui">Submitted</div></header>' +
          '<p style="padding:16px 4px;color:#475569;font-size:14px;line-height:1.5;">' +
          'Your answers are submitted. Your teacher hasn’t released results for ' +
          'this assignment yet — check back once they do.</p>';
      } catch (_) {}
    }
    function sweep() {
      try {
        var p = document.querySelector('.bluebook-results');
        if (p && !p.getAttribute('data-withheld')) {
          p.setAttribute('data-withheld', '1');
          blank(p);
        }
      } catch (_) {}
    }
    try {
      sweep();
      var obs = new MutationObserver(sweep);
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  // Ask the server whether this assignment withholds results, then arm the gate.
  (function armWithholdGate() {
    var sb = findIframeSupabase();
    if (!sb) {
      setTimeout(armWithholdGate, 200);
      return;
    }
    try {
      var q = sb.from('assignments').select('withhold_results').eq('id', ASSIGNMENT_ID).maybeSingle();
      if (q && typeof q.then === 'function') {
        q.then(function (res) {
          if (res && res.data && res.data.withhold_results) installWithholdGate();
        }, function () {});
      }
    } catch (_) {}
  })();

  // Expose a debugging handle.
  global.AssignmentBridge = {
    assignmentId: ASSIGNMENT_ID,
    clientAttemptId: CLIENT_ATTEMPT_ID,
    attemptId: CLIENT_ATTEMPT_ID,
    buildPayload: buildPayload,
    postToParent: postToParent,
    submitFromIframe: submitFromIframe,
  };
})(window);
