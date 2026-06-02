// test-runner.js — Inline test-mode runner for SAT Question Bank exports.
//
// Self-contained vanilla JS. Auto-initialises on DOMContentLoaded if the page
// declares <meta name="set-uid" content="…">. Owns:
//   - Study ↔ Test mode toggle (URL ?mode=test entry path + strip__mode-btn)
//   - Bluebook two-pane frame mounted around the existing per-card list when
//     in test mode (top bar, sub-banner, two-pane content, bottom bar)
//   - One-question-at-a-time navigation (Next / Back / question-grid jump)
//   - Choice click handling + answer persistence
//   - Cross-out toggle per choice (page-level [ABC] mode + per-choice click)
//   - Mark-for-Review per question
//   - Timer (count-up MM:SS) + Hide toggle + persistence
//   - Draggable divider with localStorage-persisted split ratio
//   - Submit → grade → render Bluebook-framed banner + per-card feedback
//   - Resume toast for an existing in-progress draft
//   - window.TestRunner.reset() / .state / .draft for debugging
//
// Depends on `window.Persistence` from persistence.js. If that script hasn't
// loaded yet, we wait for it (defensive — both scripts are <script defer>).

(function (global) {
  'use strict';

  // ------- Load persistence.js synchronously alongside this script ----------
  function ensurePersistence(cb) {
    if (global.Persistence) return cb();
    var scriptEl = document.currentScript || (function () {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && scripts[i].src.indexOf('test-runner.js') !== -1) return scripts[i];
      }
      return null;
    })();
    if (!scriptEl) return cb();
    var srcBase = scriptEl.src.replace(/test-runner\.js(?:\?.*)?$/, '');
    var s = document.createElement('script');
    s.src = srcBase + 'persistence.js';
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);

    // If the page is embedded as an LMS assignment (assignment_id in the
    // query string), also pull in assignment-bridge.js. The bridge wraps
    // Persistence.saveAttempt to postMessage the graded result up to the
    // parent LMS window. It's a no-op when assignment_id isn't present,
    // so safe to skip-load entirely in study / free-practice mode.
    try {
      var qp = new URLSearchParams(global.location.search);
      if (qp.has('assignment_id')) {
        var b = document.createElement('script');
        b.src = srcBase + 'assignment-bridge.js';
        b.defer = true;
        document.head.appendChild(b);
      }
    } catch (e) { /* URL parsing failures are benign — bridge stays inactive */ }
  }

  var SPLIT_KEY = 'sat-qb-test-split';
  var SPLIT_DEFAULT = 0.5;
  var SPLIT_MIN = 0.25;
  var SPLIT_MAX = 0.75;

  var STATE = {
    setUid: null,
    setTotal: 0,
    mode: 'study',          // 'study' | 'test'
    submitted: false,
    crossOutMode: false,    // page-level [ABC] cross-out toggle
    timerHidden: false,
    draft: null,             // { answers, marked, crossOut, currentIndex, startedAt, timeSpent, visits, firstShownAt }
    timerHandle: null,
    cards: [],               // ordered card elements
    cardsByQid: Object.create(null),
    correctByQid: Object.create(null),
    typeByQid: Object.create(null), // 'mcq' | 'spr'
    frame: null,             // .bluebook-frame container
    els: {},                 // cached refs to frame internals
    skillName: '',           // for top-bar title
    currentQid: null,        // qid the user is currently viewing (Phase-2 timing)
    reviewMode: false,       // when true, navigation cycles only through reviewQids
    reviewQids: [],          // ordered list of wrong-answer qids to cycle
    lastAttempt: null,       // grading result kept around for review/results panel
    // Highlights & Notes (v3 — see TEST_MODE_LAYOUT.md §10)
    drawerOpen: false,
    notesScope: 'this',      // 'this' | 'all'
    hlUnderline: false,      // inline highlight-bar Underline toggle state
    hlActiveRange: null,     // last captured selection Range info
    hlActiveExisting: null,  // existing mark element if selection is on one
    hlNextHid: 1,            // monotonic id allocator for new highlights
    noteSaveTimer: null,     // debounced save timer handle
  };

  function makeDraft() {
    return {
      answers: {},
      marked: {},
      crossOut: {},
      currentIndex: 0,
      startedAt: Date.now(),
      // Phase-2 per-question timing.
      timeSpent: {},     // qid -> total ms accumulated across visits
      visits: {},        // qid -> view count (>=1 per seen question)
      firstShownAt: {},  // qid -> ms timestamp of most recent enter; consumed
                         // when leaving. Lost on hard refresh — by design.
      // v3: Highlights & Notes (see TEST_MODE_LAYOUT.md §10).
      highlights: {},    // qid -> Array<{ hid, color, pane, start, end, text }>
      notes: {},         // qid -> string (free text, capped at NOTE_MAX_CHARS)
    };
  }

  function normalizeDraft(d) {
    if (!d || typeof d !== 'object') return makeDraft();
    return {
      answers: d.answers && typeof d.answers === 'object' ? d.answers : {},
      marked: d.marked && typeof d.marked === 'object' ? d.marked : {},
      crossOut: d.crossOut && typeof d.crossOut === 'object' ? d.crossOut : {},
      currentIndex: Number.isFinite(d.currentIndex) ? d.currentIndex : 0,
      startedAt: Number.isFinite(d.startedAt) ? d.startedAt : Date.now(),
      timeSpent: d.timeSpent && typeof d.timeSpent === 'object' ? d.timeSpent : {},
      visits: d.visits && typeof d.visits === 'object' ? d.visits : {},
      // Re-entering a session always discards `firstShownAt` — we can't trust
      // a timestamp from a prior page lifecycle.
      firstShownAt: {},
      highlights: d.highlights && typeof d.highlights === 'object' ? d.highlights : {},
      notes: d.notes && typeof d.notes === 'object' ? d.notes : {},
    };
  }

  // Highlights & Notes constants (see TEST_MODE_LAYOUT.md §10).
  var HL_COLORS = ['yellow', 'green', 'pink', 'blue'];
  var NOTE_MAX_CHARS = 8000;
  var NOTE_DEBOUNCE_MS = 400;

  function init() {
    var uidMeta = document.querySelector('meta[name="set-uid"]');
    if (!uidMeta) return;
    STATE.setUid = uidMeta.getAttribute('content') || '';

    var totalMeta = document.querySelector('meta[name="set-total"]');
    STATE.setTotal = totalMeta ? parseInt(totalMeta.getAttribute('content'), 10) || 0 : 0;

    // Pull a human-readable skill/title for the top-bar.
    var titleEl = document.querySelector('.strip__title');
    STATE.skillName = (titleEl && titleEl.textContent ? titleEl.textContent.trim() : '');
    if (!STATE.skillName) {
      var t = document.querySelector('title');
      STATE.skillName = t ? t.textContent.trim() : 'Practice Set';
    }

    indexCards();
    wireModeToggle();
    wireChoiceHandlers();
    wireSubmit();
    wireCurrentQObserver();

    var qp = new URLSearchParams(global.location.search);
    var initialMode = qp.get('mode') === 'test' ? 'test' : 'study';
    var existingDraft = global.Persistence
      ? global.Persistence.loadDraft(STATE.setUid)
      : null;

    if (existingDraft && existingDraft.answers && Object.keys(existingDraft.answers).length > 0) {
      enterMode('test', true);
      hydrateFromDraft(STATE.draft);
      showResumeToast(existingDraft);
    } else {
      enterMode(initialMode, true);
    }

    global.TestRunner = {
      state: STATE,
      get draft() { return STATE.draft; },
      reset: function () {
        if (global.Persistence) global.Persistence.clearForSet(STATE.setUid);
        global.location.reload();
      },
      enterMode: enterMode,
      goTo: goToIndex,
    };
  }

  // ----- card indexing ------------------------------------------------------
  function indexCards() {
    var cards = document.querySelectorAll('.card[data-qid]');
    STATE.cards = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var qid = c.getAttribute('data-qid');
      STATE.cards.push(c);
      STATE.cardsByQid[qid] = c;
      STATE.correctByQid[qid] = c.getAttribute('data-correct') || '';
      STATE.typeByQid[qid] = c.getAttribute('data-type') || 'mcq';
    }
  }

  // ----- mode toggle --------------------------------------------------------
  function wireModeToggle() {
    var btns = document.querySelectorAll('.strip__mode-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (ev) {
        var target = ev.currentTarget.getAttribute('data-mode');
        enterMode(target);
      });
    }
  }

  function enterMode(mode, silent) {
    STATE.mode = (mode === 'test') ? 'test' : 'study';
    document.body.setAttribute('data-mode', STATE.mode);

    var btns = document.querySelectorAll('.strip__mode-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-mode') === STATE.mode;
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    if (STATE.mode === 'test') {
      ensureDraftLoaded();
      STATE.submitted = false;
      removeBanner();
      removeResultsPanel();
      clearResultDecorations();
      mountBluebookFrame();
      hydrateFromDraft(STATE.draft);
      wireUnloadFlushers();
      showCurrent();
      startTimer();
      updateGridPopover();
      updateBottomBar();
    } else {
      stopTimer();
      unmountBluebookFrame();
    }
  }

  function ensureDraftLoaded() {
    if (!STATE.draft) {
      var existing = global.Persistence ? global.Persistence.loadDraft(STATE.setUid) : null;
      STATE.draft = normalizeDraft(existing || makeDraft());
      if (!existing && global.Persistence) global.Persistence.saveDraft(STATE.setUid, STATE.draft);
    } else {
      STATE.draft = normalizeDraft(STATE.draft);
    }
  }

  // ----- Bluebook frame -----------------------------------------------------
  function mountBluebookFrame() {
    if (STATE.frame) return;
    var sheet = document.querySelector('main.sheet');
    if (!sheet) return;

    var frame = document.createElement('div');
    frame.className = 'bluebook-frame';
    frame.innerHTML =
      '<header class="bluebook-top">' +
        '<div class="bluebook-top__left">' +
          '<div class="bluebook-top__title">' + escapeHtml('Section 1, Module 1: ' + STATE.skillName) + '</div>' +
          '<button type="button" class="bluebook-top__directions" data-action="directions">Directions <span class="bluebook-caret">▾</span></button>' +
        '</div>' +
        '<div class="bluebook-top__center">' +
          '<div class="bluebook-timer" id="bb-timer">00:00</div>' +
          '<button type="button" class="bluebook-timer__toggle" id="bb-timer-toggle" data-action="hide-timer">Hide <span class="bluebook-caret">▴</span></button>' +
        '</div>' +
        '<div class="bluebook-top__right">' +
          // Desmos calculator button — opens a draggable floating window.
          '<button type="button" class="bluebook-top__calc" id="bb-calc-btn" data-action="calculator" aria-pressed="false" aria-label="Open graphing calculator">' +
            '<span class="bluebook-top__calc-icon" aria-hidden="true">📐</span>' +
            '<span class="bluebook-top__calc-label">Calculator</span>' +
          '</button>' +
          // Inline highlight bar — always visible; acts on current text selection.
          '<div class="bluebook-top__hl-bar" id="bb-hl-bar" role="toolbar" aria-label="Highlight selection">' +
            '<button type="button" class="bluebook-top__hl-swatch bluebook-top__hl-swatch--yellow" data-hl-color="yellow" aria-label="Highlight yellow"></button>' +
            '<button type="button" class="bluebook-top__hl-swatch bluebook-top__hl-swatch--green"  data-hl-color="green"  aria-label="Highlight green"></button>' +
            '<button type="button" class="bluebook-top__hl-swatch bluebook-top__hl-swatch--pink"   data-hl-color="pink"   aria-label="Highlight pink"></button>' +
            '<button type="button" class="bluebook-top__hl-swatch bluebook-top__hl-swatch--blue"   data-hl-color="blue"   aria-label="Highlight blue"></button>' +
            '<button type="button" class="bluebook-top__hl-btn"  data-hl-action="underline" aria-pressed="false" aria-label="Toggle underline"><span aria-hidden="true">U̲</span></button>' +
            '<button type="button" class="bluebook-top__hl-btn bluebook-top__hl-btn--remove" data-hl-action="remove" disabled aria-label="Remove highlight">⌫</button>' +
          '</div>' +
          '<button type="button" class="bluebook-hn-pill" id="bb-hn-pill" data-action="notes" aria-pressed="false" aria-label="Notes">' +
            '<span class="bluebook-hn-pill__icon" aria-hidden="true">📝</span>' +
            '<span class="bluebook-hn-pill__label">Notes</span>' +
            '<span class="bluebook-hn-pill__badge" id="bb-hn-badge" hidden>1</span>' +
            '<span class="bluebook-hn-pill__dot" id="bb-hn-dot" hidden aria-hidden="true"></span>' +
          '</button>' +
          '<button type="button" class="bluebook-top__icon" id="bb-more" data-action="more">' +
            '<span class="bluebook-icon" aria-hidden="true">⋮</span>' +
            '<span class="bluebook-top__icon-label">More</span>' +
          '</button>' +
          '<div class="bluebook-menu" id="bb-more-menu" hidden>' +
            '<button type="button" class="bluebook-menu__item" data-action="restart">Restart test</button>' +
            '<button type="button" class="bluebook-menu__item" data-action="clear">Clear answers</button>' +
            '<button type="button" class="bluebook-menu__item" data-action="exit">Exit to study mode</button>' +
          '</div>' +
        '</div>' +
      '</header>' +
      '<div class="bluebook-content" id="bb-content">' +
        '<div class="bluebook-pane-left" id="bb-left"></div>' +
        '<div class="bluebook-divider" id="bb-divider" role="separator" aria-orientation="vertical" tabindex="0">' +
          '<span class="bluebook-divider__grip" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="bluebook-pane-right" id="bb-right">' +
          '<div class="bluebook-qheader">' +
            '<span class="bluebook-qnumber" id="bb-qnum">1</span>' +
            '<button type="button" class="bluebook-mark" id="bb-mark" data-action="mark" aria-pressed="false">' +
              '<span class="bluebook-mark__icon" aria-hidden="true">🔖</span>' +
              '<span class="bluebook-mark__label">Mark for Review</span>' +
            '</button>' +
            '<button type="button" class="bluebook-abc" id="bb-abc" data-action="abc" aria-pressed="false">ABC</button>' +
          '</div>' +
          '<div class="bluebook-stem" id="bb-stem"></div>' +
          '<div class="bluebook-choices" id="bb-choices"></div>' +
        '</div>' +
      '</div>' +
      '<footer class="bluebook-bottom">' +
        '<div class="bluebook-bottom__left" id="bb-username">' + escapeHtml(currentUserName()) + '</div>' +
        '<div class="bluebook-bottom__center">' +
          '<button type="button" class="bluebook-counter" id="bb-counter" data-action="grid">' +
            '<span id="bb-counter-text">Question 1 of ' + STATE.setTotal + '</span>' +
            ' <span class="bluebook-caret">▴</span>' +
          '</button>' +
          '<div class="bluebook-grid" id="bb-grid" hidden></div>' +
        '</div>' +
        '<div class="bluebook-bottom__right">' +
          '<button type="button" class="bluebook-back" id="bb-back" data-action="back" hidden>Back</button>' +
          '<button type="button" class="bluebook-next" id="bb-next" data-action="next">Next</button>' +
        '</div>' +
      '</footer>' +
      // ----- Notes side drawer (anchored to right edge) -----
      '<aside class="bluebook-hn-drawer" id="bb-hn-drawer" hidden aria-hidden="true" aria-label="Notes for this question">' +
        '<header class="bluebook-hn-drawer__header">' +
          '<h2 class="bluebook-hn-drawer__title" id="bb-hn-title">Notes</h2>' +
          '<button type="button" class="bluebook-hn-drawer__close" id="bb-hn-close" aria-label="Close notes">✕</button>' +
        '</header>' +
        '<div class="bluebook-hn-drawer__body" id="bb-hn-body">' +
          '<textarea class="bluebook-hn-drawer__textarea" id="bb-hn-textarea" maxlength="' + NOTE_MAX_CHARS + '" placeholder="Type a note for this question…" rows="14"></textarea>' +
          '<div class="bluebook-hn-drawer__counter" id="bb-hn-counter" aria-live="polite">0 / ' + NOTE_MAX_CHARS + '</div>' +
          '<div class="bluebook-hn-drawer__list" id="bb-hn-list" hidden></div>' +
        '</div>' +
        '<footer class="bluebook-hn-drawer__footer">' +
          '<button type="button" class="bluebook-hn-drawer__toggle" id="bb-hn-scope" aria-pressed="false">' +
            '<span class="bluebook-hn-drawer__toggle-text" id="bb-hn-scope-text">Showing: this question only</span>' +
          '</button>' +
        '</footer>' +
      '</aside>';

    document.body.appendChild(frame);
    STATE.frame = frame;

    cacheFrameRefs();
    wireFrameEvents();
    applySplit(loadSplit());
    updateGridPopover();
    updateBottomBar();
  }

  function unmountBluebookFrame() {
    if (!STATE.frame) return;
    // Restore any currently-projected card content before tearing down the frame.
    restoreCardFromFrame();
    if (STATE.frame.parentNode) STATE.frame.parentNode.removeChild(STATE.frame);
    STATE.frame = null;
    STATE.els = {};
    // Clear .is-current marker so study mode shows everything.
    var cur = document.querySelectorAll('.card.is-current');
    for (var i = 0; i < cur.length; i++) cur[i].classList.remove('is-current');
    // Close Desmos popup if open — it shouldn't survive study mode.
    closeDesmosCalculator();
  }

  function cacheFrameRefs() {
    var f = STATE.frame;
    STATE.els = {
      timer: f.querySelector('#bb-timer'),
      timerToggle: f.querySelector('#bb-timer-toggle'),
      moreBtn: f.querySelector('#bb-more'),
      moreMenu: f.querySelector('#bb-more-menu'),
      content: f.querySelector('#bb-content'),
      left: f.querySelector('#bb-left'),
      right: f.querySelector('#bb-right'),
      divider: f.querySelector('#bb-divider'),
      qnum: f.querySelector('#bb-qnum'),
      mark: f.querySelector('#bb-mark'),
      abc: f.querySelector('#bb-abc'),
      stem: f.querySelector('#bb-stem'),
      choices: f.querySelector('#bb-choices'),
      username: f.querySelector('#bb-username'),
      counter: f.querySelector('#bb-counter'),
      counterText: f.querySelector('#bb-counter-text'),
      grid: f.querySelector('#bb-grid'),
      back: f.querySelector('#bb-back'),
      next: f.querySelector('#bb-next'),
      // H&N
      hnPill: f.querySelector('#bb-hn-pill'),
      hnBadge: f.querySelector('#bb-hn-badge'),
      hnDot: f.querySelector('#bb-hn-dot'),
      hnDrawer: f.querySelector('#bb-hn-drawer'),
      hnTitle: f.querySelector('#bb-hn-title'),
      hnClose: f.querySelector('#bb-hn-close'),
      hnTextarea: f.querySelector('#bb-hn-textarea'),
      hnCounter: f.querySelector('#bb-hn-counter'),
      hnList: f.querySelector('#bb-hn-list'),
      hnScope: f.querySelector('#bb-hn-scope'),
      hnScopeText: f.querySelector('#bb-hn-scope-text'),
      // Inline highlight bar (lives in top-bar right slot)
      hlBar: f.querySelector('#bb-hl-bar'),
      hlSwatches: f.querySelectorAll('[data-hl-color]'),
      hlRemoveBtn: f.querySelector('[data-hl-action="remove"]'),
      hlUnderlineBtn: f.querySelector('[data-hl-action="underline"]'),
      // Calculator
      calcBtn: f.querySelector('#bb-calc-btn'),
    };
  }

  function wireFrameEvents() {
    var e = STATE.els;
    e.timerToggle.addEventListener('click', toggleTimerHidden);
    e.timer.addEventListener('click', function () {
      if (STATE.timerHidden) toggleTimerHidden();
    });

    e.moreBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      e.moreMenu.hidden = !e.moreMenu.hidden;
    });
    document.addEventListener('click', function (ev) {
      if (!e.moreMenu.hidden && !e.moreMenu.contains(ev.target) && ev.target !== e.moreBtn && !e.moreBtn.contains(ev.target)) {
        e.moreMenu.hidden = true;
      }
      if (e.grid && !e.grid.hidden && !e.grid.contains(ev.target) && ev.target !== e.counter && !e.counter.contains(ev.target)) {
        e.grid.hidden = true;
      }
    });

    e.moreMenu.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      e.moreMenu.hidden = true;
      if (action === 'restart' || action === 'clear') {
        if (global.Persistence) global.Persistence.clearForSet(STATE.setUid);
        global.location.reload();
      } else if (action === 'exit') {
        enterMode('study');
      }
    });

    e.mark.addEventListener('click', toggleMarkForReview);
    e.abc.addEventListener('click', toggleCrossOutMode);
    e.counter.addEventListener('click', function (ev) {
      ev.stopPropagation();
      e.grid.hidden = !e.grid.hidden;
      if (!e.grid.hidden) renderGridPopover();
    });
    e.back.addEventListener('click', function () {
      if (STATE.reviewMode) {
        var cur = currentReviewIndex();
        if (cur <= 0) { exitReviewMode(); return; }
        goToIndex(cur - 1);
        return;
      }
      goToIndex(STATE.draft.currentIndex - 1);
    });
    e.next.addEventListener('click', function () {
      if (STATE.reviewMode) {
        var cur = currentReviewIndex();
        if (cur >= STATE.reviewQids.length - 1) { exitReviewMode(); return; }
        goToIndex(cur + 1);
        return;
      }
      if (isLastIndex(STATE.draft.currentIndex)) {
        submitAttempt();
      } else {
        goToIndex(STATE.draft.currentIndex + 1);
      }
    });

    // Divider drag.
    var dragging = false;
    function onMove(ev) {
      if (!dragging) return;
      var rect = e.content.getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      var ratio = x / rect.width;
      ratio = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, ratio));
      applySplit(ratio);
      saveSplit(ratio);
      ev.preventDefault();
    }
    function onUp() {
      dragging = false;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
    }
    e.divider.addEventListener('mousedown', function (ev) {
      dragging = true;
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      ev.preventDefault();
    });
    e.divider.addEventListener('touchstart', function (ev) {
      dragging = true;
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      ev.preventDefault();
    }, { passive: false });
    e.divider.addEventListener('keydown', function (ev) {
      var ratio = loadSplit();
      if (ev.key === 'ArrowLeft') ratio -= 0.02;
      else if (ev.key === 'ArrowRight') ratio += 0.02;
      else return;
      ratio = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, ratio));
      applySplit(ratio);
      saveSplit(ratio);
      ev.preventDefault();
    });

    // Highlights & Notes wiring.
    wireHighlightsAndNotes();
  }

  // ===========================================================================
  // Highlights & Notes (see TEST_MODE_LAYOUT.md §10–§11).
  //
  // Two cooperating affordances:
  //   1. An ALWAYS-VISIBLE inline highlight bar in the top bar's right slot
  //      (color swatches + underline modifier + remove). It acts on the
  //      current text selection inside .bluebook-pane-left or .stem. When
  //      there is no live selection the color clicks are no-ops; the
  //      remove (⌫) button is disabled unless the selection sits inside an
  //      existing <mark.bb-hl>.
  //   2. A right-anchored side drawer (toggled by the top-bar Notes pill)
  //      that hosts a per-question textarea note plus a "show all notes"
  //      scope switch.
  //
  // Storage lives inside the same draft that already round-trips through
  // Persistence (LocalStorage / Supabase). On submit the SupabaseAdapter
  // additionally writes the final highlights + notes to top-level columns on
  // the test_attempts row (see migration 0044).
  // ===========================================================================

  function wireHighlightsAndNotes() {
    var e = STATE.els;
    if (!e || !e.hnPill) return;

    // ---- Pill toggle ------------------------------------------------------
    e.hnPill.addEventListener('click', toggleDrawer);
    e.hnClose.addEventListener('click', function () { setDrawerOpen(false); });

    // ---- Notes textarea ---------------------------------------------------
    e.hnTextarea.addEventListener('input', onNoteInput);
    e.hnTextarea.addEventListener('blur', flushNoteSave);

    // ---- Scope toggle -----------------------------------------------------
    e.hnScope.addEventListener('click', function () {
      STATE.notesScope = (STATE.notesScope === 'this') ? 'all' : 'this';
      renderDrawer();
    });

    // ---- Selection detection on stimulus + stem panes ---------------------
    // We keep this listener so the inline bar's ⌫ button and the active
    // color ring reflect the live selection state. The bar itself never
    // shows / hides — it is permanently visible in the top bar.
    var onSelect = function (ev) {
      // Ignore events that originate INSIDE the inline bar so swatch clicks
      // don't get treated as selection-changing events that wipe state
      // before the click handler runs.
      if (ev && ev.target && STATE.els.hlBar && STATE.els.hlBar.contains(ev.target)) {
        return;
      }
      // Defer one tick so getSelection() reflects the final selection.
      setTimeout(refreshHighlightBarState, 0);
    };
    STATE.frame.addEventListener('mousedown', onSelect);
    STATE.frame.addEventListener('pointerup', onSelect);
    STATE.frame.addEventListener('keyup', onSelect);
    document.addEventListener('selectionchange', onSelect);

    // ---- Inline highlight bar buttons ------------------------------------
    if (e.hlBar) {
      e.hlBar.addEventListener('mousedown', function (ev) {
        // Stop mousedown from collapsing the active selection.
        ev.preventDefault();
      });
      e.hlBar.addEventListener('click', function (ev) {
        if (STATE.submitted) return;
        var swatch = ev.target.closest('[data-hl-color]');
        if (swatch) {
          // Refresh state first so we know if there's an active selection.
          captureSelectionForBar();
          applyHighlightFromBar(swatch.getAttribute('data-hl-color'));
          return;
        }
        var act = ev.target.closest('[data-hl-action]');
        if (!act) return;
        var action = act.getAttribute('data-hl-action');
        if (action === 'underline') {
          STATE.hlUnderline = !STATE.hlUnderline;
          act.classList.toggle('is-on', STATE.hlUnderline);
          act.setAttribute('aria-pressed', STATE.hlUnderline ? 'true' : 'false');
        } else if (action === 'remove') {
          captureSelectionForBar();
          removeExistingHighlight();
        }
      });
    }

    // ---- Calculator button -----------------------------------------------
    if (e.calcBtn) {
      e.calcBtn.addEventListener('click', toggleDesmosCalculator);
    }

    // First-time hydration: paint highlights for the initial question + sync
    // the drawer state + the inline bar's enabled/disabled state.
    paintHighlightsForCurrent();
    renderDrawer();
    refreshHnPill();
    refreshHighlightBarState();
  }

  // --- Drawer ---------------------------------------------------------------
  function toggleDrawer() {
    setDrawerOpen(!STATE.drawerOpen);
  }

  function setDrawerOpen(open) {
    STATE.drawerOpen = !!open;
    var el = STATE.els.hnDrawer;
    if (!el) return;
    el.hidden = !STATE.drawerOpen;
    el.setAttribute('aria-hidden', STATE.drawerOpen ? 'false' : 'true');
    if (STATE.els.hnPill) STATE.els.hnPill.setAttribute('aria-pressed', STATE.drawerOpen ? 'true' : 'false');
    if (STATE.frame) STATE.frame.classList.toggle('bluebook-frame--hn-open', STATE.drawerOpen);
    if (STATE.drawerOpen) {
      renderDrawer();
      // Defer focus so the slide-in animation doesn't grab caret too early.
      setTimeout(function () {
        if (STATE.notesScope === 'this' && STATE.els.hnTextarea) STATE.els.hnTextarea.focus();
      }, 50);
    }
  }

  function currentQidSafe() {
    if (STATE.currentQid) return STATE.currentQid;
    var card = STATE.cards[STATE.draft && STATE.draft.currentIndex || 0];
    return card ? card.getAttribute('data-qid') : null;
  }

  function renderDrawer() {
    var e = STATE.els;
    if (!e || !e.hnDrawer) return;
    var qid = currentQidSafe();
    var qIndex = STATE.draft && Number.isFinite(STATE.draft.currentIndex) ? STATE.draft.currentIndex : 0;
    e.hnTitle.textContent = 'Notes — Question ' + (qIndex + 1);

    var scopeIsAll = (STATE.notesScope === 'all');
    e.hnScope.setAttribute('aria-pressed', scopeIsAll ? 'true' : 'false');
    e.hnScopeText.textContent = scopeIsAll
      ? 'Showing: all notes in this set'
      : 'Showing: this question only';

    if (scopeIsAll) {
      e.hnTextarea.hidden = true;
      e.hnCounter.hidden = true;
      e.hnList.hidden = false;
      renderAllNotesList();
    } else {
      e.hnTextarea.hidden = false;
      e.hnCounter.hidden = false;
      e.hnList.hidden = true;
      var text = (STATE.draft && STATE.draft.notes && STATE.draft.notes[qid]) || '';
      // Avoid clobbering an active edit if the user is currently typing.
      if (document.activeElement !== e.hnTextarea) {
        e.hnTextarea.value = text;
      }
      e.hnCounter.textContent = e.hnTextarea.value.length + ' / ' + NOTE_MAX_CHARS;
      e.hnTextarea.disabled = STATE.submitted;
    }
  }

  function renderAllNotesList() {
    var e = STATE.els;
    if (!e || !e.hnList) return;
    var notes = (STATE.draft && STATE.draft.notes) || {};
    var entries = [];
    for (var i = 0; i < STATE.cards.length; i++) {
      var card = STATE.cards[i];
      var qid = card.getAttribute('data-qid');
      var txt = notes[qid];
      if (txt && String(txt).trim().length) {
        entries.push({ qid: qid, qIndex: i, text: String(txt) });
      }
    }
    // Latest-edited at the top — we don't track per-note mtime so fall back
    // to the natural question order reversed (most-recently-typed notes
    // tend to be on the latest questions during a sitting).
    entries.reverse();
    if (!entries.length) {
      e.hnList.innerHTML = '<p class="bluebook-hn-drawer__empty u-ui">No notes yet for this set.</p>';
      return;
    }
    var html = entries.map(function (en) {
      var head = 'Question ' + (en.qIndex + 1);
      return '<details class="bluebook-hn-drawer__item" data-qid="' + escapeHtml(en.qid) + '" open>' +
        '<summary class="bluebook-hn-drawer__item-summary">' +
          '<span class="bluebook-hn-drawer__item-num u-mono">' + escapeHtml(head) + '</span>' +
          '<button type="button" class="bluebook-hn-drawer__item-jump u-ui" data-action="jump">Go →</button>' +
        '</summary>' +
        '<div class="bluebook-hn-drawer__item-body">' + escapeHtml(en.text).replace(/\n/g, '<br>') + '</div>' +
      '</details>';
    }).join('');
    e.hnList.innerHTML = html;
    var jumps = e.hnList.querySelectorAll('[data-action="jump"]');
    for (var k = 0; k < jumps.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          var det = btn.closest('details');
          var qid = det && det.getAttribute('data-qid');
          if (!qid) return;
          var idx = STATE.cards.findIndex(function (c) { return c.getAttribute('data-qid') === qid; });
          if (idx >= 0) {
            STATE.notesScope = 'this';
            goToIndex(idx);
          }
        });
      })(jumps[k]);
    }
  }

  function onNoteInput() {
    if (STATE.submitted) return;
    var qid = currentQidSafe();
    if (!qid) return;
    var el = STATE.els.hnTextarea;
    var val = el.value;
    if (val.length > NOTE_MAX_CHARS) {
      val = val.slice(0, NOTE_MAX_CHARS);
      el.value = val;
    }
    STATE.draft.notes = STATE.draft.notes || {};
    if (val.length === 0) {
      delete STATE.draft.notes[qid];
    } else {
      STATE.draft.notes[qid] = val;
    }
    STATE.els.hnCounter.textContent = val.length + ' / ' + NOTE_MAX_CHARS;
    if (STATE.noteSaveTimer) clearTimeout(STATE.noteSaveTimer);
    STATE.noteSaveTimer = setTimeout(function () {
      STATE.noteSaveTimer = null;
      persistDraft();
      refreshHnPill();
    }, NOTE_DEBOUNCE_MS);
  }

  function flushNoteSave() {
    if (STATE.noteSaveTimer) {
      clearTimeout(STATE.noteSaveTimer);
      STATE.noteSaveTimer = null;
      persistDraft();
      refreshHnPill();
    }
  }

  // The Notes pill badge reflects note presence ONLY — highlight presence
  // is already visually obvious via the inline highlight bar in the top
  // bar (active-color ring), so duplicating it here would be noise.
  function refreshHnPill() {
    var e = STATE.els;
    if (!e || !e.hnPill) return;
    var qid = currentQidSafe();
    var hasNote = !!(STATE.draft && STATE.draft.notes && STATE.draft.notes[qid] && String(STATE.draft.notes[qid]).trim().length);
    if (hasNote) {
      e.hnBadge.hidden = false;
      e.hnBadge.textContent = '1';
    } else {
      e.hnBadge.hidden = true;
    }
    e.hnDot.hidden = !hasNote;
  }

  // --- Highlight selection logic -------------------------------------------

  // Find the "anchor" pane that fully contains the given range — only
  // selections that live entirely inside the stimulus (.bluebook-pane-left)
  // or the stem (.bluebook-pane-right .stem) qualify.
  function highlightAnchorFor(range) {
    if (!range) return null;
    var node = range.commonAncestorContainer;
    var el = (node && node.nodeType === 1) ? node : (node && node.parentNode);
    if (!el) return null;
    var left = STATE.els && STATE.els.left;
    var stem = STATE.els && STATE.els.stem;
    if (left && left.contains(el)) return { el: left, pane: 'stimulus' };
    if (stem && stem.contains(el)) return { el: stem, pane: 'stem' };
    return null;
  }

  // Convert a Range to character offsets relative to the anchor element's
  // visible text content. Robust to nested elements (existing <mark>s, <p>,
  // etc.) because we walk text nodes ourselves rather than relying on
  // .textContent slicing.
  function rangeToOffsets(anchor, range) {
    var start = -1;
    var end = -1;
    var acc = 0;
    var walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue ? node.nodeValue.length : 0;
      if (start < 0 && node === range.startContainer) {
        start = acc + range.startOffset;
      } else if (start < 0 && range.startContainer.contains && range.startContainer.contains(node)) {
        // startContainer is an element above us; we've already passed it
        // — treat the start of this text node as the start offset.
        start = acc;
      }
      if (end < 0 && node === range.endContainer) {
        end = acc + range.endOffset;
      }
      acc += len;
      if (start >= 0 && end >= 0) break;
    }
    if (start < 0 || end < 0 || end <= start) return null;
    return { start: start, end: end };
  }

  // Inverse: walk text nodes and build a Range from {start, end} offsets.
  function offsetsToRange(anchor, start, end) {
    if (start == null || end == null || end <= start) return null;
    var range = document.createRange();
    var acc = 0;
    var startSet = false;
    var endSet = false;
    var walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue ? node.nodeValue.length : 0;
      var nodeStart = acc;
      var nodeEnd = acc + len;
      if (!startSet && start >= nodeStart && start <= nodeEnd) {
        range.setStart(node, start - nodeStart);
        startSet = true;
      }
      if (!endSet && end >= nodeStart && end <= nodeEnd) {
        range.setEnd(node, end - nodeStart);
        endSet = true;
      }
      acc = nodeEnd;
      if (startSet && endSet) break;
    }
    if (!startSet || !endSet) return null;
    return range;
  }

  // Detect whether the given range lies entirely inside an existing highlight.
  function existingHighlightFor(range) {
    if (!range) return null;
    var node = range.commonAncestorContainer;
    var el = (node && node.nodeType === 1) ? node : (node && node.parentNode);
    if (!el) return null;
    var mark = el.closest && el.closest('mark.bb-hl');
    return mark || null;
  }

  // Capture the current selection / existing-mark state into STATE.hlActive*.
  // Returns the captured object (or null if nothing usable). Pure side-effect
  // on STATE; safe to call repeatedly.
  function captureSelectionForBar() {
    STATE.hlActiveRange = null;
    STATE.hlActiveExisting = null;
    if (STATE.submitted) return null;
    var sel = global.getSelection ? global.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return null;
    var range = sel.getRangeAt(0);
    var existing = existingHighlightFor(range);
    var anchor = highlightAnchorFor(range);
    if (!anchor) return null;
    var collapsed = range.collapsed;
    // A purely collapsed caret with no existing mark below it gives us
    // nothing to act on.
    if (collapsed && !existing) return null;
    STATE.hlActiveExisting = existing || null;
    STATE.hlActiveRange = {
      pane: anchor.pane,
      anchor: anchor.el,
      // Capture offsets now — repainting can replace nodes and invalidate
      // a live Range later.
      offsets: collapsed ? null : rangeToOffsets(anchor.el, range),
      text: collapsed ? '' : range.toString(),
    };
    return STATE.hlActiveRange;
  }

  // Sync the inline highlight bar's enabled / pressed state to whatever the
  // current selection is. Called on selectionchange + pointer / keyup, and
  // after every highlight mutation.
  function refreshHighlightBarState() {
    var e = STATE.els;
    if (!e || !e.hlBar) return;
    captureSelectionForBar();
    // ⌫ remove: enabled only when the active selection is on an existing mark.
    if (e.hlRemoveBtn) {
      var canRemove = !!STATE.hlActiveExisting && !STATE.submitted;
      e.hlRemoveBtn.disabled = !canRemove;
      e.hlRemoveBtn.setAttribute('aria-disabled', canRemove ? 'false' : 'true');
    }
    // Underline pressed state stays in sync with STATE.hlUnderline.
    if (e.hlUnderlineBtn) {
      e.hlUnderlineBtn.classList.toggle('is-on', !!STATE.hlUnderline);
      e.hlUnderlineBtn.setAttribute('aria-pressed', STATE.hlUnderline ? 'true' : 'false');
    }
    // Active-color ring: if the selection is inside an existing mark, show
    // which color it currently is.
    if (e.hlSwatches && e.hlSwatches.length) {
      var activeColor = null;
      if (STATE.hlActiveExisting) {
        for (var i = 0; i < HL_COLORS.length; i++) {
          if (STATE.hlActiveExisting.classList.contains('bb-hl--' + HL_COLORS[i])) {
            activeColor = HL_COLORS[i];
            break;
          }
        }
      }
      for (var j = 0; j < e.hlSwatches.length; j++) {
        var sw = e.hlSwatches[j];
        var c = sw.getAttribute('data-hl-color');
        sw.classList.toggle('is-active', !!activeColor && c === activeColor);
      }
    }
  }

  // Lightweight aria-live hint surface for "select text first" feedback.
  function flashHighlightHint(msg) {
    var hint = document.getElementById('bb-hl-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'bb-hl-hint';
      hint.className = 'bluebook-hl-hint';
      hint.setAttribute('role', 'status');
      hint.setAttribute('aria-live', 'polite');
      document.body.appendChild(hint);
    }
    hint.textContent = msg;
    hint.classList.add('is-visible');
    clearTimeout(hint._t);
    hint._t = setTimeout(function () { hint.classList.remove('is-visible'); }, 1400);
  }

  function applyHighlightFromBar(color) {
    if (STATE.submitted) return;
    if (HL_COLORS.indexOf(color) < 0) color = 'yellow';

    // No active selection / mark — give a small hint and bail.
    if (!STATE.hlActiveRange && !STATE.hlActiveExisting) {
      flashHighlightHint('Select text first to highlight');
      return;
    }

    // If selection is on an existing highlight, repaint it in-place.
    if (STATE.hlActiveExisting) {
      var existing = STATE.hlActiveExisting;
      for (var i = 0; i < HL_COLORS.length; i++) {
        existing.classList.remove('bb-hl--' + HL_COLORS[i]);
      }
      existing.classList.add('bb-hl--' + color);
      existing.classList.toggle('bb-hl--underline', STATE.hlUnderline);
      var hid = existing.getAttribute('data-hid');
      var qid = currentQidSafe();
      var arr = (STATE.draft.highlights && STATE.draft.highlights[qid]) || [];
      for (var j = 0; j < arr.length; j++) {
        if (String(arr[j].hid) === String(hid)) {
          arr[j].color = color;
          arr[j].underline = !!STATE.hlUnderline;
          break;
        }
      }
      persistDraft();
      refreshHnPill();
      refreshHighlightBarState();
      return;
    }

    var pane = STATE.hlActiveRange.pane;
    var offsets = STATE.hlActiveRange.offsets;
    var text = STATE.hlActiveRange.text;
    if (!offsets || offsets.end <= offsets.start) {
      flashHighlightHint('Select text first to highlight');
      return;
    }

    var qidN = currentQidSafe();
    if (!qidN) return;
    STATE.draft.highlights = STATE.draft.highlights || {};
    STATE.draft.highlights[qidN] = STATE.draft.highlights[qidN] || [];

    var newHid = 'h' + (Date.now().toString(36)) + (STATE.hlNextHid++);
    var record = {
      hid: newHid,
      color: color,
      pane: pane,
      start: offsets.start,
      end: offsets.end,
      text: text || '',
      underline: !!STATE.hlUnderline,
    };
    STATE.draft.highlights[qidN].push(record);

    // Re-paint from scratch so overlapping highlights resolve cleanly.
    paintHighlightsForCurrent();
    persistDraft();
    refreshHnPill();
    // Clear the user's text selection so they don't accidentally re-highlight.
    try { global.getSelection().removeAllRanges(); } catch (e) {}
    refreshHighlightBarState();
  }

  function removeExistingHighlight() {
    var existing = STATE.hlActiveExisting;
    if (!existing) return;
    var hid = existing.getAttribute('data-hid');
    var qid = currentQidSafe();
    if (!qid) return;
    var arr = (STATE.draft.highlights && STATE.draft.highlights[qid]) || [];
    STATE.draft.highlights[qid] = arr.filter(function (h) { return String(h.hid) !== String(hid); });
    if (STATE.draft.highlights[qid].length === 0) delete STATE.draft.highlights[qid];

    paintHighlightsForCurrent();
    persistDraft();
    refreshHnPill();
    refreshHighlightBarState();
  }

  // Re-apply all stored highlights for the current question to the live DOM.
  // Strategy: strip existing <mark.bb-hl> first (preserving children), then
  // sort records by start offset ascending and wrap each via Range surrounding.
  function paintHighlightsForCurrent() {
    if (!STATE.frame || !STATE.els) return;
    var qid = currentQidSafe();
    if (!qid) return;
    var records = (STATE.draft && STATE.draft.highlights && STATE.draft.highlights[qid]) || [];

    var panes = [
      { pane: 'stimulus', anchor: STATE.els.left },
      { pane: 'stem', anchor: STATE.els.stem },
    ];
    for (var p = 0; p < panes.length; p++) {
      var pane = panes[p];
      if (!pane.anchor) continue;
      stripMarksIn(pane.anchor);
    }

    if (!records.length) return;

    // Sort by start so wrapping in order keeps offsets stable (we re-derive
    // a fresh Range per record and surroundContents — DOM mutations from a
    // prior wrap don't shift later offsets because the offsets are measured
    // against text content which is unchanged by inserting <mark> wrappers).
    var sorted = records.slice().sort(function (a, b) { return a.start - b.start; });
    for (var i = 0; i < sorted.length; i++) {
      var rec = sorted[i];
      var anchor = (rec.pane === 'stem') ? STATE.els.stem : STATE.els.left;
      if (!anchor) continue;
      var range = offsetsToRange(anchor, rec.start, rec.end);
      if (!range) continue;
      wrapRangeWithMark(range, rec);
    }
  }

  function stripMarksIn(root) {
    if (!root) return;
    var marks = root.querySelectorAll('mark.bb-hl');
    for (var i = marks.length - 1; i >= 0; i--) {
      var m = marks[i];
      var parent = m.parentNode;
      if (!parent) continue;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    }
  }

  function wrapRangeWithMark(range, record) {
    try {
      // If the range spans multiple elements, surroundContents will throw.
      // Use a fallback path that splits the range into per-text-node sub
      // ranges and wraps each one.
      try {
        var mark = document.createElement('mark');
        mark.className = 'bb-hl bb-hl--' + (record.color || 'yellow') + (record.underline ? ' bb-hl--underline' : '');
        mark.setAttribute('data-hid', record.hid);
        range.surroundContents(mark);
        return;
      } catch (_) {
        wrapRangeAcrossNodes(range, record);
      }
    } catch (e) { /* swallow — failed wraps just mean no visual mark */ }
  }

  function wrapRangeAcrossNodes(range, record) {
    var anchor = (record.pane === 'stem') ? STATE.els.stem : STATE.els.left;
    if (!anchor) return;
    var acc = 0;
    var walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT, null);
    var node;
    var toWrap = [];
    while ((node = walker.nextNode())) {
      var len = node.nodeValue ? node.nodeValue.length : 0;
      var nodeStart = acc;
      var nodeEnd = acc + len;
      if (nodeEnd <= record.start) { acc = nodeEnd; continue; }
      if (nodeStart >= record.end) break;
      var s = Math.max(0, record.start - nodeStart);
      var e = Math.min(len, record.end - nodeStart);
      if (e > s) toWrap.push({ node: node, s: s, e: e });
      acc = nodeEnd;
    }
    for (var i = 0; i < toWrap.length; i++) {
      var w = toWrap[i];
      try {
        var r = document.createRange();
        r.setStart(w.node, w.s);
        r.setEnd(w.node, w.e);
        var mark = document.createElement('mark');
        mark.className = 'bb-hl bb-hl--' + (record.color || 'yellow') + (record.underline ? ' bb-hl--underline' : '');
        mark.setAttribute('data-hid', record.hid);
        r.surroundContents(mark);
      } catch (_) {}
    }
  }

  // ===========================================================================
  // Desmos graphing calculator (see TEST_MODE_LAYOUT.md §11).
  //
  // Lazy-loaded on first open. Renders inside a draggable, resizable
  // floating window above the bluebook frame. Window position + size
  // persist in localStorage; calculator graph state persists in
  // sessionStorage (graph survives drawer toggles but not reloads).
  // ===========================================================================

  var DESMOS_SCRIPT_URL = 'https://www.desmos.com/api/v1.10/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
  var DESMOS_POS_KEY = 'sat-qb-desmos-position';
  var DESMOS_STATE_KEY = 'sat-qb-desmos-state';
  var DESMOS = {
    container: null,       // floating window element
    header: null,
    body: null,
    closeBtn: null,
    scriptLoading: false,
    scriptLoaded: false,
    calculator: null,      // Desmos GraphingCalculator instance
    pendingState: null,    // state captured between sessions
  };

  function toggleDesmosCalculator() {
    if (DESMOS.container && DESMOS.container.classList.contains('is-open')) {
      closeDesmosCalculator();
    } else {
      openDesmosCalculator();
    }
  }

  function openDesmosCalculator() {
    if (STATE.submitted) return;
    ensureDesmosContainer();
    // Lazy-load script on first open.
    loadDesmosScript(function () {
      ensureDesmosInstance();
      DESMOS.container.classList.add('is-open');
      DESMOS.container.hidden = false;
      if (STATE.els.calcBtn) {
        STATE.els.calcBtn.setAttribute('aria-pressed', 'true');
        STATE.els.calcBtn.classList.add('is-on');
      }
    });
  }

  function closeDesmosCalculator() {
    if (!DESMOS.container) return;
    // Snapshot calculator state to sessionStorage so re-open restores graph.
    if (DESMOS.calculator) {
      try {
        var st = DESMOS.calculator.getState();
        sessionStorage.setItem(DESMOS_STATE_KEY, JSON.stringify(st));
      } catch (e) { /* sessionStorage full or calc not ready */ }
    }
    saveDesmosPosition();
    DESMOS.container.classList.remove('is-open');
    DESMOS.container.hidden = true;
    if (STATE.els.calcBtn) {
      STATE.els.calcBtn.setAttribute('aria-pressed', 'false');
      STATE.els.calcBtn.classList.remove('is-on');
    }
  }

  function ensureDesmosContainer() {
    if (DESMOS.container) return;
    var win = document.createElement('div');
    win.id = 'bb-desmos';
    win.className = 'bluebook-desmos';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Graphing calculator');
    win.hidden = true;
    win.innerHTML =
      '<header class="bluebook-desmos__header" id="bb-desmos-header">' +
        '<span class="bluebook-desmos__title">Graphing Calculator</span>' +
        '<button type="button" class="bluebook-desmos__close" id="bb-desmos-close" aria-label="Close calculator">×</button>' +
      '</header>' +
      '<div class="bluebook-desmos__body" id="bb-desmos-body"></div>';
    document.body.appendChild(win);
    DESMOS.container = win;
    DESMOS.header = win.querySelector('#bb-desmos-header');
    DESMOS.body = win.querySelector('#bb-desmos-body');
    DESMOS.closeBtn = win.querySelector('#bb-desmos-close');
    DESMOS.closeBtn.addEventListener('click', closeDesmosCalculator);
    applyDesmosPosition(loadDesmosPosition());
    wireDesmosDrag();
  }

  function loadDesmosScript(cb) {
    if (DESMOS.scriptLoaded) { cb(); return; }
    if (DESMOS.scriptLoading) {
      // Poll briefly until the in-flight load completes.
      var tries = 0;
      var iv = setInterval(function () {
        if (DESMOS.scriptLoaded) { clearInterval(iv); cb(); }
        else if (++tries > 200) { clearInterval(iv); cb(); }
      }, 50);
      return;
    }
    DESMOS.scriptLoading = true;
    var s = document.createElement('script');
    s.src = DESMOS_SCRIPT_URL;
    s.async = true;
    s.onload = function () {
      DESMOS.scriptLoaded = true;
      DESMOS.scriptLoading = false;
      cb();
    };
    s.onerror = function () {
      DESMOS.scriptLoading = false;
      // Surface a quiet error in the body so the user knows what failed.
      if (DESMOS.body) {
        DESMOS.body.innerHTML = '<p class="bluebook-desmos__error u-ui">' +
          'Could not load the graphing calculator. Check your internet connection.' +
          '</p>';
      }
      cb();
    };
    document.head.appendChild(s);
  }

  function ensureDesmosInstance() {
    if (DESMOS.calculator || !DESMOS.body) return;
    if (typeof global.Desmos === 'undefined' || !global.Desmos.GraphingCalculator) return;
    try {
      DESMOS.calculator = global.Desmos.GraphingCalculator(DESMOS.body, {
        keypad: true,
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
        border: false,
      });
      // Restore last session's state if present.
      try {
        var raw = sessionStorage.getItem(DESMOS_STATE_KEY);
        if (raw) DESMOS.calculator.setState(JSON.parse(raw));
      } catch (e) { /* ignore */ }
    } catch (e) { /* swallow — instantiation failure is best-effort */ }
  }

  function defaultDesmosPosition() {
    var w = 720;
    var h = 480;
    var left = Math.max(16, Math.round((global.innerWidth - w) / 2));
    var top = Math.max(16, Math.round((global.innerHeight - h) / 2));
    return { left: left, top: top, width: w, height: h };
  }

  function loadDesmosPosition() {
    try {
      var raw = localStorage.getItem(DESMOS_POS_KEY);
      if (!raw) return defaultDesmosPosition();
      var v = JSON.parse(raw);
      if (!v || typeof v !== 'object') return defaultDesmosPosition();
      // Clamp into viewport so a previous-session off-screen position is recoverable.
      var w = Number(v.width)  || 720;
      var h = Number(v.height) || 480;
      var left = Math.min(Math.max(0, Number(v.left) || 0), Math.max(0, global.innerWidth  - 80));
      var top  = Math.min(Math.max(0, Number(v.top)  || 0), Math.max(0, global.innerHeight - 80));
      return { left: left, top: top, width: w, height: h };
    } catch (e) { return defaultDesmosPosition(); }
  }

  function saveDesmosPosition() {
    if (!DESMOS.container) return;
    var rect = DESMOS.container.getBoundingClientRect();
    var pos = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    try { localStorage.setItem(DESMOS_POS_KEY, JSON.stringify(pos)); } catch (e) {}
  }

  function applyDesmosPosition(pos) {
    if (!DESMOS.container || !pos) return;
    DESMOS.container.style.left = pos.left + 'px';
    DESMOS.container.style.top = pos.top + 'px';
    DESMOS.container.style.width = pos.width + 'px';
    DESMOS.container.style.height = pos.height + 'px';
  }

  function wireDesmosDrag() {
    if (!DESMOS.header || !DESMOS.container) return;
    var dragging = false;
    var startX = 0, startY = 0, startLeft = 0, startTop = 0;
    DESMOS.header.addEventListener('pointerdown', function (ev) {
      // Only the header is a drag handle — and not the close button.
      if (ev.target && ev.target.closest && ev.target.closest('.bluebook-desmos__close')) return;
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      var r = DESMOS.container.getBoundingClientRect();
      startLeft = r.left;
      startTop = r.top;
      DESMOS.header.setPointerCapture && DESMOS.header.setPointerCapture(ev.pointerId);
      DESMOS.container.classList.add('is-dragging');
      ev.preventDefault();
    });
    DESMOS.header.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      var w = DESMOS.container.offsetWidth;
      var h = DESMOS.container.offsetHeight;
      var nextLeft = Math.min(Math.max(0, startLeft + dx), Math.max(0, global.innerWidth  - w));
      var nextTop  = Math.min(Math.max(0, startTop  + dy), Math.max(0, global.innerHeight - h));
      DESMOS.container.style.left = nextLeft + 'px';
      DESMOS.container.style.top = nextTop + 'px';
    });
    var endDrag = function (ev) {
      if (!dragging) return;
      dragging = false;
      try { DESMOS.header.releasePointerCapture && DESMOS.header.releasePointerCapture(ev.pointerId); } catch (e) {}
      DESMOS.container.classList.remove('is-dragging');
      saveDesmosPosition();
    };
    DESMOS.header.addEventListener('pointerup', endDrag);
    DESMOS.header.addEventListener('pointercancel', endDrag);
  }

  function applySplit(ratio) {
    if (!STATE.els.content) return;
    var pct = (ratio * 100).toFixed(2) + '%';
    STATE.els.content.style.gridTemplateColumns = pct + ' var(--bb-divider-w, 14px) 1fr';
  }
  function loadSplit() {
    try {
      var raw = localStorage.getItem(SPLIT_KEY);
      var v = raw ? parseFloat(raw) : NaN;
      if (!isFinite(v)) return SPLIT_DEFAULT;
      return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, v));
    } catch (e) { return SPLIT_DEFAULT; }
  }
  function saveSplit(ratio) {
    try { localStorage.setItem(SPLIT_KEY, String(ratio)); } catch (e) {}
  }

  function currentUserName() {
    try {
      if (global.__persistence && global.__persistence.userDisplayName) {
        return global.__persistence.userDisplayName;
      }
    } catch (e) {}
    return 'Guest';
  }

  // ----- per-question timing (Phase 2) -------------------------------------

  // Called whenever the user "leaves" a question (Next/Back/grid jump/submit/
  // tab-hidden/beforeunload). Accumulates ms into timeSpent[qid]. Safe to call
  // repeatedly — clears firstShownAt[qid] so a second call is a no-op until
  // the user enters another question.
  function leaveCurrentQuestion(persist) {
    if (STATE.submitted) return;
    var d = STATE.draft;
    if (!d || !d.firstShownAt) return;
    var qid = STATE.currentQid;
    if (!qid) return;
    var startedAt = d.firstShownAt[qid];
    if (!startedAt) return;
    var delta = Date.now() - startedAt;
    if (delta < 0) delta = 0;
    d.timeSpent = d.timeSpent || {};
    d.timeSpent[qid] = (d.timeSpent[qid] || 0) + delta;
    delete d.firstShownAt[qid];
    if (persist !== false) persistDraft();
  }

  // Called when a question becomes the current one (boot, Next, Back, jump).
  // Stamps firstShownAt[qid] and increments visits[qid]. Cheap; no persist.
  function enterQuestion(qid) {
    if (!qid) return;
    var d = STATE.draft;
    d.visits = d.visits || {};
    d.firstShownAt = d.firstShownAt || {};
    d.visits[qid] = (d.visits[qid] || 0) + 1;
    d.firstShownAt[qid] = Date.now();
    STATE.currentQid = qid;
  }

  // Wire visibilitychange + beforeunload once. Both flush the current
  // question's elapsed time into the draft so a tab switch doesn't
  // double-count.
  var _unloadWired = false;
  function wireUnloadFlushers() {
    if (_unloadWired) return;
    _unloadWired = true;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        leaveCurrentQuestion(true);
        // Re-stamp on return so the next visible chunk also counts.
        if (STATE.mode === 'test' && !STATE.submitted && STATE.currentQid) {
          var d = STATE.draft;
          d.firstShownAt = d.firstShownAt || {};
          // Park firstShownAt to be re-set on 'visible' (so we don't lose
          // the user's place mid-tab-switch).
        }
      } else if (document.visibilityState === 'visible') {
        if (STATE.mode === 'test' && !STATE.submitted && STATE.currentQid && STATE.draft) {
          STATE.draft.firstShownAt = STATE.draft.firstShownAt || {};
          if (!STATE.draft.firstShownAt[STATE.currentQid]) {
            STATE.draft.firstShownAt[STATE.currentQid] = Date.now();
          }
        }
      }
    });
    global.addEventListener('beforeunload', function () {
      // Synchronous flush — saveDraft is sync in the LocalStorage path and a
      // best-effort cache write in the Supabase path.
      leaveCurrentQuestion(true);
    });
  }

  // ----- show current question ---------------------------------------------
  function showCurrent() {
    if (STATE.mode !== 'test' || !STATE.frame) return;
    var idx = clamp(STATE.draft.currentIndex, 0, Math.max(0, STATE.cards.length - 1));
    STATE.draft.currentIndex = idx;

    var card = STATE.cards[idx];
    if (!card) return;

    // First, restore any previously-projected content back to its card.
    restoreCardFromFrame();

    // Hide all cards, show this one.
    for (var i = 0; i < STATE.cards.length; i++) {
      STATE.cards[i].classList.toggle('is-current', i === idx);
    }

    // Project the card's stimulus + stem + choices into the bluebook panes.
    // We physically MOVE the existing nodes so any event listeners attached
    // to .choice elements (from wireChoiceHandlers) keep working.
    var qid = card.getAttribute('data-qid');
    var stimulus = card.querySelector('.stimulus');
    var stem = card.querySelector('.stem');
    var choices = card.querySelector('.choices, .gridin');

    var left = STATE.els.left;
    var stemSlot = STATE.els.stem;
    var choicesSlot = STATE.els.choices;

    left.innerHTML = '';
    stemSlot.innerHTML = '';
    choicesSlot.innerHTML = '';

    if (stimulus) left.appendChild(stimulus);
    else left.innerHTML = '<div class="bluebook-pane-left__empty u-ui">(No passage for this question)</div>';

    if (stem) stemSlot.appendChild(stem);
    if (choices) choicesSlot.appendChild(choices);

    // Header bits.
    var n = idx + 1;
    STATE.els.qnum.textContent = String(n);

    // Mark-for-Review state for this question.
    var marked = !!(STATE.draft.marked && STATE.draft.marked[qid]);
    STATE.els.mark.classList.toggle('is-on', marked);
    STATE.els.mark.setAttribute('aria-pressed', marked ? 'true' : 'false');
    STATE.els.mark.querySelector('.bluebook-mark__label').textContent = marked ? 'Marked for Review' : 'Mark for Review';

    // Update Next button text on last question.
    var isLast = isLastIndex(idx);
    STATE.els.next.textContent = isLast ? 'Submit' : 'Next';
    STATE.els.next.classList.toggle('bluebook-next--submit', isLast);

    // Back visibility.
    STATE.els.back.hidden = idx === 0;

    updateBottomBar();
    applyCrossOutToCard(qid);

    // Per-question timing: stamp this question as "entered" if we haven't
    // already (idempotent — repeated showCurrent() calls on the same qid
    // are no-ops). Skipped while reviewing a submitted attempt.
    if (!STATE.submitted) {
      if (STATE.currentQid !== qid) {
        enterQuestion(qid);
        persistDraft();
      }
    } else {
      STATE.currentQid = qid;
    }

    // Review-missed mode: project the matching rationale into the right
    // pane (below the choices) so the student can read it inline.
    if (STATE.reviewMode) renderReviewRationaleForCurrent();

    // Highlights & Notes — re-paint stored highlights for THIS question and
    // refresh the drawer's body + the top-bar pill badge + the inline bar.
    paintHighlightsForCurrent();
    renderDrawer();
    refreshHnPill();
    refreshHighlightBarState();
  }

  function goToIndex(target) {
    var n = STATE.cards.length;
    if (n === 0) return;
    // In review mode the index drives a virtual list of wrong-answer qids
    // rather than the underlying card order; map accordingly.
    if (STATE.reviewMode && STATE.reviewQids.length) {
      var rIdx = clamp(target, 0, STATE.reviewQids.length - 1);
      var qid = STATE.reviewQids[rIdx];
      var cardIdx = STATE.cards.findIndex(function (c) { return c.getAttribute('data-qid') === qid; });
      if (cardIdx < 0) return;
      STATE.draft.currentIndex = cardIdx;
      showCurrent();
      return;
    }
    var idx = clamp(target, 0, n - 1);
    if (idx === STATE.draft.currentIndex) {
      showCurrent();
      return;
    }
    // Leaving current question — flush accumulated time before advancing.
    leaveCurrentQuestion(false);
    STATE.draft.currentIndex = idx;
    persistDraft();
    showCurrent();
  }

  function restoreCardFromFrame() {
    // Move the projected nodes back to their originating card so a future
    // showCurrent() can re-locate them.
    var current = document.querySelector('.card.is-current[data-qid]');
    if (!current) return;
    var left = STATE.els && STATE.els.left;
    var stemSlot = STATE.els && STATE.els.stem;
    var choicesSlot = STATE.els && STATE.els.choices;
    if (!left || !stemSlot || !choicesSlot) return;

    var stimulus = left.querySelector('.stimulus');
    var stem = stemSlot.querySelector('.stem');
    var choices = choicesSlot.querySelector('.choices, .gridin');

    if (stimulus) current.appendChild(stimulus);
    if (stem) current.appendChild(stem);
    if (choices) current.appendChild(choices);
  }

  function isLastIndex(idx) {
    return STATE.cards.length > 0 && idx >= STATE.cards.length - 1;
  }

  // ----- choice + SPR handlers ---------------------------------------------
  function wireChoiceHandlers() {
    var cards = document.querySelectorAll('.card[data-qid]');
    for (var i = 0; i < cards.length; i++) {
      bindCard(cards[i]);
    }
  }

  function bindCard(card) {
    var qid = card.getAttribute('data-qid');
    var type = card.getAttribute('data-type') || 'mcq';
    if (type === 'spr') {
      var input = card.querySelector('.gridin__entry-input');
      if (input) {
        input.addEventListener('input', function () {
          if (STATE.mode !== 'test' || STATE.submitted) return;
          setAnswer(qid, input.value);
        });
      }
    } else {
      var choices = card.querySelectorAll('.choice');
      for (var i = 0; i < choices.length; i++) {
        (function (ch) {
          ch.addEventListener('click', function (ev) {
            // Click on cross-out button always toggles cross-out for that letter.
            var crossBtn = ev.target.closest('.choice__circle--cross');
            if (crossBtn) {
              ev.stopPropagation();
              toggleCrossOut(qid, ch);
              return;
            }
            // In page-level cross-out mode, clicking anywhere on the row also crosses out.
            if (STATE.crossOutMode) {
              toggleCrossOut(qid, ch);
              return;
            }
            handleChoice(qid, ch, card);
          });
          ch.addEventListener('keydown', function (ev) {
            if (ev.key === ' ' || ev.key === 'Enter') {
              ev.preventDefault();
              if (STATE.crossOutMode) toggleCrossOut(qid, ch);
              else handleChoice(qid, ch, card);
            }
          });
        })(choices[i]);
      }
    }
  }

  function handleChoice(qid, choiceEl, cardEl) {
    if (STATE.mode !== 'test' || STATE.submitted) return;
    var letter = choiceEl.getAttribute('data-letter');
    // Can't select a crossed-out choice.
    if (isCrossedOut(qid, letter)) return;

    // Sibling lookup must be done on the live parent (which is either the
    // original card OR — when in test mode — the projected #bb-choices slot
    // because we MOVE the .choices node into the frame).
    var parent = choiceEl.parentNode || cardEl;
    var siblings = parent.querySelectorAll('.choice');
    for (var i = 0; i < siblings.length; i++) {
      var s = siblings[i];
      var on = (s === choiceEl);
      s.setAttribute('data-selected', on ? 'true' : 'false');
      s.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    setAnswer(qid, letter);
  }

  function setAnswer(qid, value) {
    ensureDraftLoaded();
    if (value === '' || value == null) {
      delete STATE.draft.answers[qid];
    } else {
      STATE.draft.answers[qid] = value;
    }
    persistDraft();
    updateGridPopover();
  }

  function persistDraft() {
    // Don't resurrect a finished/cleared draft. saveAttempt() clears the
    // draft on submit; anything after that point is review/inspect-only.
    if (STATE.submitted) return;
    if (global.Persistence) global.Persistence.saveDraft(STATE.setUid, STATE.draft);
  }

  function hydrateFromDraft(draft) {
    if (!draft || !draft.answers) return;
    for (var qid in draft.answers) {
      if (!Object.prototype.hasOwnProperty.call(draft.answers, qid)) continue;
      var card = STATE.cardsByQid[qid];
      if (!card) continue;
      var value = draft.answers[qid];
      var type = STATE.typeByQid[qid] || 'mcq';
      if (type === 'spr') {
        var input = card.querySelector('.gridin__entry-input');
        if (input) input.value = value;
      } else {
        var choices = card.querySelectorAll('.choice');
        for (var i = 0; i < choices.length; i++) {
          var on = (choices[i].getAttribute('data-letter') === value);
          choices[i].setAttribute('data-selected', on ? 'true' : 'false');
          choices[i].setAttribute('aria-checked', on ? 'true' : 'false');
        }
      }
    }
    // Re-apply cross-out visuals for every card.
    var co = draft.crossOut || {};
    for (var qid2 in co) {
      if (!Object.prototype.hasOwnProperty.call(co, qid2)) continue;
      applyCrossOutToCard(qid2);
    }
  }

  // ----- Mark-for-Review ----------------------------------------------------
  function toggleMarkForReview() {
    if (STATE.mode !== 'test' || STATE.submitted) return;
    var card = STATE.cards[STATE.draft.currentIndex];
    if (!card) return;
    var qid = card.getAttribute('data-qid');
    STATE.draft.marked = STATE.draft.marked || {};
    if (STATE.draft.marked[qid]) delete STATE.draft.marked[qid];
    else STATE.draft.marked[qid] = true;
    persistDraft();
    // Re-render mark button without re-projecting the card content.
    var marked = !!STATE.draft.marked[qid];
    STATE.els.mark.classList.toggle('is-on', marked);
    STATE.els.mark.setAttribute('aria-pressed', marked ? 'true' : 'false');
    STATE.els.mark.querySelector('.bluebook-mark__label').textContent = marked ? 'Marked for Review' : 'Mark for Review';
    updateGridPopover();
  }

  // ----- Cross-out ---------------------------------------------------------
  function toggleCrossOutMode() {
    STATE.crossOutMode = !STATE.crossOutMode;
    STATE.els.abc.classList.toggle('is-on', STATE.crossOutMode);
    STATE.els.abc.setAttribute('aria-pressed', STATE.crossOutMode ? 'true' : 'false');
    document.body.classList.toggle('bluebook-crossout-mode', STATE.crossOutMode);
  }

  function toggleCrossOut(qid, choiceEl) {
    if (STATE.mode !== 'test' || STATE.submitted) return;
    var letter = choiceEl.getAttribute('data-letter');
    STATE.draft.crossOut = STATE.draft.crossOut || {};
    STATE.draft.crossOut[qid] = STATE.draft.crossOut[qid] || {};
    if (STATE.draft.crossOut[qid][letter]) {
      delete STATE.draft.crossOut[qid][letter];
    } else {
      STATE.draft.crossOut[qid][letter] = true;
      // If this choice was selected, un-select it.
      if (STATE.draft.answers[qid] === letter) {
        delete STATE.draft.answers[qid];
        choiceEl.setAttribute('data-selected', 'false');
        choiceEl.setAttribute('aria-checked', 'false');
      }
    }
    persistDraft();
    applyCrossOutToCard(qid);
    updateGridPopover();
  }

  function isCrossedOut(qid, letter) {
    return !!(STATE.draft && STATE.draft.crossOut && STATE.draft.crossOut[qid] && STATE.draft.crossOut[qid][letter]);
  }

  function applyCrossOutToCard(qid) {
    var card = STATE.cardsByQid[qid];
    if (!card) return;
    var co = (STATE.draft && STATE.draft.crossOut && STATE.draft.crossOut[qid]) || {};
    // The .choices node may have been moved into #bb-choices when this card
    // is currently projected into the bluebook frame. Look there first, fall
    // back to the original card.
    var scope = (STATE.els && STATE.els.choices && card.classList.contains('is-current'))
      ? STATE.els.choices
      : card;
    var choices = scope.querySelectorAll('.choice[data-letter]');
    for (var i = 0; i < choices.length; i++) {
      var letter = choices[i].getAttribute('data-letter');
      choices[i].classList.toggle('choice--crossed', !!co[letter]);
    }
  }

  // ----- timer --------------------------------------------------------------
  function startTimer() {
    stopTimer();
    if (!STATE.draft) return;
    var el = STATE.els.timer;
    if (!el) return;
    function tick() {
      var secs = Math.max(0, Math.floor((Date.now() - STATE.draft.startedAt) / 1000));
      el.textContent = formatTime(secs);
    }
    tick();
    STATE.timerHandle = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (STATE.timerHandle) {
      clearInterval(STATE.timerHandle);
      STATE.timerHandle = null;
    }
  }
  function toggleTimerHidden() {
    STATE.timerHidden = !STATE.timerHidden;
    if (STATE.els.timer) STATE.els.timer.classList.toggle('is-hidden', STATE.timerHidden);
    if (STATE.els.timerToggle) {
      STATE.els.timerToggle.innerHTML = STATE.timerHidden
        ? 'Show <span class="bluebook-caret">▾</span>'
        : 'Hide <span class="bluebook-caret">▴</span>';
    }
  }
  function formatTime(secs) {
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return pad2(m) + ':' + pad2(s);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // ----- bottom bar + grid popover -----------------------------------------
  function updateBottomBar() {
    if (!STATE.els.counterText) return;
    if (STATE.reviewMode && STATE.reviewQids.length) {
      var i = currentReviewIndex();
      STATE.els.counterText.textContent = 'Review ' + (i + 1) + ' of ' + STATE.reviewQids.length;
      return;
    }
    var n = STATE.draft.currentIndex + 1;
    STATE.els.counterText.textContent = 'Question ' + n + ' of ' + STATE.cards.length;
  }

  function updateGridPopover() {
    if (STATE.els && STATE.els.grid && !STATE.els.grid.hidden) {
      renderGridPopover();
    }
  }

  function renderGridPopover() {
    if (!STATE.els.grid) return;
    var grid = STATE.els.grid;
    grid.innerHTML = '';
    var header = document.createElement('div');
    header.className = 'bluebook-grid__title';
    header.textContent = 'Check Your Work';
    grid.appendChild(header);

    var cells = document.createElement('div');
    cells.className = 'bluebook-grid__cells';
    for (var i = 0; i < STATE.cards.length; i++) {
      var qid = STATE.cards[i].getAttribute('data-qid');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bluebook-grid__cell';
      b.setAttribute('data-index', String(i));
      var n = i + 1;
      var marked = !!(STATE.draft.marked && STATE.draft.marked[qid]);
      var answered = STATE.draft.answers && STATE.draft.answers[qid] != null && STATE.draft.answers[qid] !== '';
      var current = i === STATE.draft.currentIndex;
      if (answered) b.classList.add('is-answered');
      if (marked) b.classList.add('is-marked');
      if (current) b.classList.add('is-current');
      b.innerHTML = '<span class="bluebook-grid__num">' + n + '</span>' +
        (marked ? '<span class="bluebook-grid__flag" aria-hidden="true">🔖</span>' : '');
      (function (targetIdx) {
        b.addEventListener('click', function () {
          STATE.els.grid.hidden = true;
          goToIndex(targetIdx);
        });
      })(i);
      cells.appendChild(b);
    }
    grid.appendChild(cells);
  }

  // ----- submit + grading ---------------------------------------------------
  function wireSubmit() {
    var btn = document.getElementById('test-submit');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (STATE.mode !== 'test') return;
      submitAttempt();
    });
  }

  function submitAttempt() {
    if (!STATE.draft) return;
    // Final per-question flush before snapshotting times.
    leaveCurrentQuestion(false);

    var submittedAt = Date.now();
    var startedAt = STATE.draft.startedAt || submittedAt;
    var secondsTaken = Math.max(0, Math.round((submittedAt - startedAt) / 1000));
    var qids = Object.keys(STATE.cardsByQid);
    var answers = [];
    var score = 0;
    var timeSpent = STATE.draft.timeSpent || {};
    var visits = STATE.draft.visits || {};
    for (var i = 0; i < qids.length; i++) {
      var qid = qids[i];
      var chosen = STATE.draft.answers[qid];
      if (chosen == null) chosen = '';
      var correctVal = STATE.correctByQid[qid] || '';
      var isCorrect = false;
      if (correctVal) {
        if (STATE.typeByQid[qid] === 'spr') {
          isCorrect = normalizeSpr(chosen) === normalizeSpr(correctVal);
        } else {
          isCorrect = String(chosen).toUpperCase() === String(correctVal).toUpperCase();
        }
      }
      if (isCorrect) score++;
      answers.push({
        qid: qid,
        chosen: chosen,
        isCorrect: isCorrect,
        // Phase-2 pacing analytics.
        answerTimeMs: Number(timeSpent[qid] || 0),
        revisitCount: Number(visits[qid] || 0),
      });
    }

    var attempt = {
      startedAt: startedAt,
      submittedAt: submittedAt,
      secondsTaken: secondsTaken,
      score: score,
      total: qids.length,
      source: 'static',
      answers: answers,
      // v3: per-question annotations preserved on the submitted row (see
      // migration 0044). LocalStorageAdapter round-trips these transparently;
      // SupabaseAdapter writes them to top-level highlights/notes columns.
      highlights: (STATE.draft && STATE.draft.highlights) || {},
      notes: (STATE.draft && STATE.draft.notes) || {},
    };

    STATE.submitted = true;
    STATE.lastAttempt = attempt;
    stopTimer();
    if (global.Persistence) global.Persistence.saveAttempt(STATE.setUid, attempt);
    decorateResults(attempt);
    renderResultsPanel(attempt);
    if (STATE.els.next) STATE.els.next.hidden = true;
    if (STATE.els.back) STATE.els.back.hidden = true;
    if (STATE.els.counter) STATE.els.counter.hidden = true;
    // Tear down the Desmos popup if it's open — results panel shouldn't
    // share screen with the calculator.
    closeDesmosCalculator();
    // Reflect submitted state on the inline highlight bar.
    refreshHighlightBarState();
  }

  function normalizeSpr(s) {
    return String(s || '').trim().replace(/\s+/g, '').toLowerCase();
  }

  function decorateResults(attempt) {
    for (var i = 0; i < attempt.answers.length; i++) {
      var a = attempt.answers[i];
      var card = STATE.cardsByQid[a.qid];
      if (!card) continue;
      card.classList.add(a.isCorrect ? 'card--correct' : 'card--wrong');
      var type = STATE.typeByQid[a.qid];
      if (type === 'spr') {
        var input = card.querySelector('.gridin__entry-input');
        if (input) input.setAttribute('data-result', a.isCorrect ? 'correct' : 'wrong');
      } else {
        var correct = STATE.correctByQid[a.qid];
        var scope = (STATE.els && STATE.els.choices && card.classList.contains('is-current'))
          ? STATE.els.choices
          : card;
        var choices = scope.querySelectorAll('.choice[data-letter]');
        for (var j = 0; j < choices.length; j++) {
          var letter = choices[j].getAttribute('data-letter');
          if (letter === correct) {
            choices[j].setAttribute('data-result', a.isCorrect ? 'correct' : 'correct-unchosen');
          } else if (letter === a.chosen) {
            choices[j].setAttribute('data-result', 'wrong');
          }
        }
      }
    }
  }

  function clearResultDecorations() {
    var cards = document.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.remove('card--correct', 'card--wrong');
    }
    var choices = document.querySelectorAll('.choice[data-result]');
    for (var j = 0; j < choices.length; j++) choices[j].removeAttribute('data-result');
    var inputs = document.querySelectorAll('.gridin__entry-input[data-result]');
    for (var k = 0; k < inputs.length; k++) inputs[k].removeAttribute('data-result');
  }

  // ----- results panel (Phase-2 pacing chart) ------------------------------
  //
  // Replaces the old .test-banner — a single panel inside the Bluebook right
  // pane that shows: four summary cards, a per-question time bar chart with
  // a dashed target-pace line, and three action buttons. Designed to match
  // the editorial-clean Bluebook reference (subtle navy bars, monospace
  // numerals, dashed rule for the target line). Honours @media print
  // (table-only fallback) and prefers-reduced-motion (no bar animation).
  function renderResultsPanel(attempt) {
    removeBanner();
    removeResultsPanel();

    var host = STATE.frame ? STATE.els.right : document.querySelector('main.sheet');
    if (!host) return;

    var pct = attempt.total > 0 ? attempt.score / attempt.total : 0;
    var totalSecs = attempt.secondsTaken || 0;
    var avgSecs = attempt.total > 0 ? Math.round(totalSecs / attempt.total) : 0;

    // Per-question time data (ms → seconds).
    var times = attempt.answers.map(function (a) {
      return {
        qid: a.qid,
        chosen: a.chosen,
        correct: STATE.correctByQid[a.qid] || '',
        isCorrect: !!a.isCorrect,
        ms: Math.max(0, Number(a.answerTimeMs || 0)),
        secs: Math.max(0, Math.round(Number(a.answerTimeMs || 0) / 1000)),
        visits: Number(a.revisitCount || 0),
        marked: !!(STATE.draft.marked && STATE.draft.marked[a.qid]),
      };
    });
    var maxMs = times.reduce(function (m, t) { return t.ms > m ? t.ms : m; }, 0);
    // Slowest-tertile threshold: bars in the top 1/3 by time get full opacity.
    var sortedMs = times.map(function (t) { return t.ms; }).sort(function (a, b) { return b - a; });
    var slowestThresholdMs = sortedMs.length
      ? sortedMs[Math.max(0, Math.floor(sortedMs.length / 3) - 1)]
      : 0;
    var slowestQid = times.reduce(function (best, t) { return (best == null || t.ms > best.ms) ? t : best; }, null);

    // Median question time (or 90s default). Used both for the target-pace
    // line on the chart and for the qualitative pacing label.
    var sortedAsc = times.map(function (t) { return t.secs; }).filter(function (s) { return s > 0; }).sort(function (a, b) { return a - b; });
    var medianSecs = sortedAsc.length
      ? sortedAsc[Math.floor(sortedAsc.length / 2)]
      : 0;
    var targetSecs = (medianSecs > 0 && medianSecs < 240) ? medianSecs : 90;

    var pacingLabel = qualitativePacing(avgSecs, targetSecs);
    var missedCount = times.filter(function (t) { return !t.isCorrect; }).length;

    var panel = document.createElement('section');
    panel.className = 'bluebook-results';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Results');

    var headerHtml = ''
      + '<header class="bluebook-results__header">'
      +   '<h2 class="bluebook-results__title">' + escapeHtml(STATE.skillName || 'Practice Set') + '</h2>'
      +   '<div class="bluebook-results__eyebrow u-ui">Results</div>'
      + '</header>';

    var summaryHtml = ''
      + '<div class="bluebook-results__summary" role="list">'
      +   summaryCard('Score', attempt.score + ' <span class="bluebook-results__den">/ ' + attempt.total + '</span>', Math.round(pct * 100) + '%')
      +   summaryCard('Total time', formatTime(totalSecs), '')
      +   summaryCard('Average', formatTime(avgSecs) + ' <span class="bluebook-results__unit">/Q</span>', '')
      +   summaryCard('Pacing', pacingLabel.label, pacingLabel.sublabel, 'bluebook-results__card--' + pacingLabel.tone)
      + '</div>';

    // Chart section.
    var rowsHtml = times.map(function (t, i) {
      var widthPct = maxMs > 0 ? Math.max(2, (t.ms / maxMs) * 100) : 2;
      var isSlowest = (slowestQid && t.qid === slowestQid.qid && t.ms > 0);
      var isSlowTier = t.ms > 0 && t.ms >= slowestThresholdMs && slowestThresholdMs > 0;
      var rowCls = 'bluebook-results__row'
        + (isSlowest ? ' is-slowest' : '')
        + (isSlowTier ? ' is-slow-tier' : '')
        + (t.isCorrect ? ' is-correct' : ' is-wrong');
      var tooltip = [];
      if (t.visits > 1) tooltip.push('Visited ' + t.visits + '×');
      if (t.marked) tooltip.push('Marked for review');
      var tooltipAttr = tooltip.length ? ' title="' + escapeHtml(tooltip.join(' · ')) + '"' : '';
      var detail = '';
      if (!t.isCorrect) {
        detail = '<span class="bluebook-results__detail">chose ' + escapeHtml(t.chosen || '—')
          + ' · correct ' + escapeHtml(t.correct || '—') + '</span>';
      } else if (isSlowest) {
        detail = '<span class="bluebook-results__detail bluebook-results__detail--label">slowest</span>';
      }
      return ''
        + '<div class="' + rowCls + '"' + tooltipAttr + '>'
        +   '<div class="bluebook-results__qlabel u-mono">Q' + (i + 1) + '</div>'
        +   '<div class="bluebook-results__bar-track">'
        +     '<div class="bluebook-results__bar" data-target-width="' + widthPct.toFixed(2) + '" style="width:0%;"></div>'
        +   '</div>'
        +   '<div class="bluebook-results__time u-mono">' + formatTime(t.secs) + '</div>'
        +   '<div class="bluebook-results__mark" aria-hidden="true">' + (t.isCorrect ? '✓' : '✗') + '</div>'
        +   detail
        + '</div>';
    }).join('');

    // Print fallback: a clean table that drops bars + chrome.
    var printTableRows = times.map(function (t, i) {
      return ''
        + '<tr>'
        +   '<td>Q' + (i + 1) + '</td>'
        +   '<td>' + formatTime(t.secs) + '</td>'
        +   '<td>' + (t.isCorrect ? '✓' : '✗') + '</td>'
        +   '<td>' + (t.isCorrect ? '' : ('chose ' + escapeHtml(t.chosen || '—') + ' · correct ' + escapeHtml(t.correct || '—'))) + '</td>'
        + '</tr>';
    }).join('');

    var chartHtml = ''
      + '<section class="bluebook-results__chart" aria-label="Time per question">'
      +   '<div class="bluebook-results__chart-header u-ui">Time per question</div>'
      +   '<div class="bluebook-results__rows">' + rowsHtml + '</div>'
      +   '<div class="bluebook-results__target u-ui" aria-hidden="true">'
      +     '<span class="bluebook-results__target-line"></span>'
      +     '<span class="bluebook-results__target-label">target pace · ' + formatTime(targetSecs) + ' / Q</span>'
      +   '</div>'
      + '</section>'
      + '<table class="bluebook-results__print-table" aria-hidden="true">'
      +   '<thead><tr><th>Q</th><th>Time</th><th>Result</th><th>Notes</th></tr></thead>'
      +   '<tbody>' + printTableRows + '</tbody>'
      + '</table>';

    var actionsHtml = ''
      + '<footer class="bluebook-results__actions">'
      +   '<button type="button" class="bluebook-results__btn bluebook-results__btn--primary" data-action="review"' + (missedCount === 0 ? ' disabled' : '') + '>'
      +     'Review missed (' + missedCount + ')'
      +   '</button>'
      +   '<button type="button" class="bluebook-results__btn" data-action="restart">Restart</button>'
      +   '<button type="button" class="bluebook-results__btn" data-action="bank">Back to bank</button>'
      + '</footer>';

    panel.innerHTML = headerHtml + summaryHtml + chartHtml + actionsHtml;
    host.insertBefore(panel, host.firstChild);

    // Hide the question header + stem + choices block under the results
    // panel while showing results — clean visual hierarchy. The card content
    // is still in the DOM for re-decoration when entering review mode. The
    // LEFT pane (stimulus) stays visible so the student can re-read passages
    // alongside the chart.
    var qheader = STATE.frame ? STATE.frame.querySelector('.bluebook-qheader') : null;
    if (qheader) qheader.hidden = true;
    if (STATE.els && STATE.els.stem) STATE.els.stem.hidden = true;
    if (STATE.els && STATE.els.choices) STATE.els.choices.hidden = true;

    // Animate bars: width 0 → final (200ms ease-out) unless reduced-motion.
    var prefersReduce = global.matchMedia
      && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var bars = panel.querySelectorAll('.bluebook-results__bar');
    if (prefersReduce) {
      for (var b = 0; b < bars.length; b++) {
        bars[b].style.width = bars[b].getAttribute('data-target-width') + '%';
      }
    } else {
      // Defer one frame so the 0% width sticks, then transition to the target.
      requestAnimationFrame(function () {
        for (var b = 0; b < bars.length; b++) {
          bars[b].style.transition = 'width 200ms ease-out';
          bars[b].style.width = bars[b].getAttribute('data-target-width') + '%';
        }
      });
    }

    // Wire actions.
    panel.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action === 'review') {
        startReviewMissed(attempt);
      } else if (action === 'restart') {
        if (!global.confirm || global.confirm('Restart the test? Your current answers will be cleared.')) {
          if (global.Persistence) global.Persistence.clearForSet(STATE.setUid);
          global.location.reload();
        }
      } else if (action === 'bank') {
        global.location.href = bankIndexHref();
      }
    });
  }

  function removeResultsPanel() {
    var p = document.querySelector('.bluebook-results');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }

  function summaryCard(label, value, sublabel, extraCls) {
    return ''
      + '<div class="bluebook-results__card ' + (extraCls || '') + '" role="listitem">'
      +   '<div class="bluebook-results__card-label u-ui">' + escapeHtml(label) + '</div>'
      +   '<div class="bluebook-results__card-value u-mono">' + value + '</div>'
      +   (sublabel ? '<div class="bluebook-results__card-sub u-ui">' + escapeHtml(sublabel) + '</div>' : '')
      + '</div>';
  }

  function qualitativePacing(avgSecs, targetSecs) {
    if (!avgSecs) return { label: 'on pace', sublabel: '', tone: 'neutral' };
    var ratio = avgSecs / targetSecs;
    if (ratio < 0.75)  return { label: 'well under pace', sublabel: 'fast', tone: 'fast' };
    if (ratio < 0.95)  return { label: 'on pace', sublabel: '', tone: 'good' };
    if (ratio < 1.15)  return { label: 'on pace', sublabel: '', tone: 'good' };
    if (ratio < 1.4)   return { label: 'slightly slow', sublabel: '', tone: 'warn' };
    return { label: 'running over', sublabel: '', tone: 'slow' };
  }

  // Best-effort path to the exports index. The questions file lives at
  // .../by-skill/<domain>/<difficulty>/<slug>_questions.html (3 deep
  // under /exports/), so 3 ".." segments get us back.
  function bankIndexHref() {
    var path = global.location.pathname || '';
    var idx = path.indexOf('/exports/');
    if (idx >= 0) {
      return path.substring(0, idx) + '/exports/index.html';
    }
    // Fallback: try walking up from the current file based on the
    // by-skill/by-domain/by-mixed depth (always 3 levels under /exports).
    return '../../../index.html';
  }

  // Backwards-compatible alias. Test-banner is no longer rendered but keep
  // the helper so renderResultsPanel() can safely remove any straggler from
  // a stale page or e2e fixture.
  function removeBanner() {
    var b = document.querySelector('.test-banner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  // ----- Review-missed flow -------------------------------------------------
  //
  // Re-enters test mode but constrains navigation to a curated list of qids
  // (the wrong-answer set). The Bluebook frame stays mounted; we just swap
  // `STATE.cards` semantics via the reviewMode flag in goToIndex(). Per-card
  // rationale is fetched from the sibling _key.html once and cached.
  function startReviewMissed(attempt) {
    var wrongQids = (attempt.answers || [])
      .filter(function (a) { return !a.isCorrect; })
      .map(function (a) { return a.qid; });
    if (!wrongQids.length) return;

    STATE.reviewMode = true;
    STATE.reviewQids = wrongQids;
    removeResultsPanel();
    var qheader = STATE.frame ? STATE.frame.querySelector('.bluebook-qheader') : null;
    if (qheader) qheader.hidden = false;
    if (STATE.els.stem) STATE.els.stem.hidden = false;
    if (STATE.els.choices) STATE.els.choices.hidden = false;
    if (STATE.els.next) {
      STATE.els.next.hidden = false;
      STATE.els.next.textContent = 'Next';
    }
    if (STATE.els.back) STATE.els.back.hidden = false;
    if (STATE.els.counter) STATE.els.counter.hidden = false;

    // Repoint Next/Back to walk the wrongQids list. We do this by
    // shadowing goToIndex via the reviewMode branch already added.
    var idxInReview = 0;
    var firstQid = wrongQids[idxInReview];
    var firstCardIdx = STATE.cards.findIndex(function (c) { return c.getAttribute('data-qid') === firstQid; });
    if (firstCardIdx < 0) return;
    STATE.draft.currentIndex = firstCardIdx;
    showCurrent();

    // Next/Back handlers respect STATE.reviewMode via the original wireFrameEvents
    // listeners — no need to override them here.

    // Pre-warm the rationale cache. The actual injection happens per-card
    // via renderReviewRationaleForCurrent() inside showCurrent().
    loadRationales();
    renderReviewRationaleForCurrent();

    // Counter shows "Review N of M" in review mode — updateBottomBar()
    // handles this branch via the reviewMode flag.
    updateBottomBar();
  }

  function currentReviewIndex() {
    var qid = STATE.cards[STATE.draft.currentIndex]
      ? STATE.cards[STATE.draft.currentIndex].getAttribute('data-qid')
      : null;
    return Math.max(0, STATE.reviewQids.indexOf(qid));
  }

  function exitReviewMode() {
    STATE.reviewMode = false;
    STATE.reviewQids = [];
    // Clear any inline rationale + restore Next/Back behaviour to default
    // by un-shadowing onclick handlers.
    var right = STATE.els && STATE.els.right;
    if (right) {
      var rat = right.querySelector('.review-rationale');
      if (rat && rat.parentNode) rat.parentNode.removeChild(rat);
    }
    if (STATE.lastAttempt) renderResultsPanel(STATE.lastAttempt);
  }

  // Locate the answer-key HTML next to this _questions.html so we can pull
  // rationales for the Review-missed flow. The file naming convention is
  // <slug>_questions.html <-> <slug>_key.html in the same directory.
  function keyHrefForThisPage() {
    var href = global.location.pathname || '';
    return href.replace(/_questions\.html(?:[?#].*)?$/, '_key.html');
  }

  var _rationaleCache = null;
  function loadRationales() {
    if (_rationaleCache) return _rationaleCache;
    _rationaleCache = fetch(keyHrefForThisPage(), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        var map = Object.create(null);
        if (!html) return map;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        // The key file uses `<article class="key-entry">`. The Phase-2 build
        // adds `data-qid="qN"` to each. Fall back to ordered matching if
        // missing (older builds).
        var entries = doc.querySelectorAll('article.key-entry');
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          var qid = e.getAttribute('data-qid') || ('q' + (i + 1));
          map[qid] = {
            rationale: e.querySelector('.key-entry__rationale'),
            choice: e.querySelector('.key-entry__choice'),
          };
        }
        return map;
      })
      .catch(function () { return Object.create(null); });
    return _rationaleCache;
  }

  // Render the rationale block for the question currently shown in the
  // Bluebook right pane. Idempotent — removes any prior rationale block
  // before re-rendering so each Next/Back swap is clean.
  function renderReviewRationaleForCurrent() {
    var right = STATE.els && STATE.els.right;
    if (!right) return;
    // Drop any stale rationale block before re-rendering.
    var old = right.querySelector('.review-rationale');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var qid = STATE.cards[STATE.draft.currentIndex]
      && STATE.cards[STATE.draft.currentIndex].getAttribute('data-qid');
    if (!qid) return;

    loadRationales().then(function (map) {
      // Verify we're still on the same qid (Next clicks can race).
      var curQid = STATE.cards[STATE.draft.currentIndex]
        && STATE.cards[STATE.draft.currentIndex].getAttribute('data-qid');
      if (curQid !== qid) return;
      var entry = map[qid];
      if (!entry || !entry.rationale) return;
      var chosen = (STATE.draft.answers && STATE.draft.answers[qid]) || '—';
      var correct = STATE.correctByQid[qid] || '—';
      var box = document.createElement('div');
      box.className = 'review-rationale';
      box.innerHTML = ''
        + '<div class="review-rationale__head u-ui">'
        +   '<span class="review-rationale__pill review-rationale__pill--wrong">Your answer: ' + escapeHtml(String(chosen)) + '</span>'
        +   '<span class="review-rationale__pill review-rationale__pill--right">Correct: ' + escapeHtml(String(correct)) + '</span>'
        + '</div>'
        + (entry.choice ? '<div class="review-rationale__choice">' + entry.choice.innerHTML + '</div>' : '')
        + '<div class="review-rationale__body">' + entry.rationale.innerHTML + '</div>';
      right.appendChild(box);
    });
  }

  // ----- live Q-counter (legacy strip__pos updater for study mode) ---------
  function wireCurrentQObserver() {
    var counter = document.querySelector('.strip__pos [data-current-q]');
    if (!counter) return;
    var cards = document.querySelectorAll('.card[data-qid]');
    if (!cards.length || !('IntersectionObserver' in global)) return;

    var visible = Object.create(null);
    var io = new IntersectionObserver(function (entries) {
      if (STATE.mode === 'test') return;
      for (var i = 0; i < entries.length; i++) {
        var en = entries[i];
        var qid = en.target.getAttribute('data-qid');
        if (en.isIntersecting) visible[qid] = en.intersectionRatio;
        else delete visible[qid];
      }
      var top = null;
      var topQid = null;
      for (var qid2 in visible) {
        if (top == null || visible[qid2] > top) { top = visible[qid2]; topQid = qid2; }
      }
      if (topQid) {
        var n = parseInt(topQid.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(n)) counter.textContent = String(n);
      }
    }, { rootMargin: '-30% 0px -50% 0px', threshold: [0.1, 0.5, 1.0] });

    for (var i = 0; i < cards.length; i++) io.observe(cards[i]);
  }

  // ----- resume toast -------------------------------------------------------
  function showResumeToast(draft) {
    var sec = Math.max(1, Math.round((Date.now() - (draft.startedAt || Date.now())) / 60000));
    var toast = document.createElement('div');
    toast.className = 'test-toast';
    toast.innerHTML = ''
      + '<div class="test-toast__title">Resume your test?</div>'
      + '<div class="test-toast__meta">Started ' + sec + ' min ago · ' + Object.keys(draft.answers || {}).length + ' answered</div>'
      + '<div class="test-toast__actions">'
      +   '<button class="test-toast__btn test-toast__btn--primary" data-action="keep" type="button">Resume</button>'
      +   '<button class="test-toast__btn" data-action="discard" type="button">Discard</button>'
      + '</div>';
    document.body.appendChild(toast);
    toast.querySelector('[data-action="keep"]').addEventListener('click', function () {
      toast.parentNode && toast.parentNode.removeChild(toast);
    });
    toast.querySelector('[data-action="discard"]').addEventListener('click', function () {
      if (global.Persistence) global.Persistence.clearForSet(STATE.setUid);
      global.location.reload();
    });
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 12000);
  }

  // ----- utils -------------------------------------------------------------
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ----- boot ---------------------------------------------------------------
  function boot() {
    ensurePersistence(function () {
      var ready = (global.__persistencePromise && typeof global.__persistencePromise.then === 'function')
        ? global.__persistencePromise.then(function () {}, function () {})
        : Promise.resolve();
      ready.then(function () {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
          init();
        }
      });
    });
  }

  boot();
})(typeof window !== 'undefined' ? window : globalThis);
