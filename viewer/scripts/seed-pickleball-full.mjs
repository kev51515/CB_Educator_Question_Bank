#!/usr/bin/env node
/**
 * seed-pickleball-full.mjs
 *
 * Full, realistic demo content for BOTH pickleball demo courses
 * ("Pickleball Demo — Players" + "Pickleball Demo — Coaches") owned by
 * kevyao@gmail.com. Embeds researched, IPTPA-aligned material: a real drill
 * library (with demo YouTube links), a 7-player roster (intake scores +
 * lessons + homework), a clinic/event schedule with registrations + a
 * waitlist, a 3-coach roster (certs + development tracks that auto-complete
 * via hours/shadow triggers + evaluations), and seeded chat in both rooms.
 *
 * Writes directly through the service role (bypasses RLS — the pk_* RPCs are
 * auth.uid()-scoped and can't be called server-side). Idempotent-ish:
 *   - Parent rows (programs, drills, events) are find-or-create by name.
 *   - Per-person content (player/coach profiles, assessments, lessons,
 *     homework, certs, dev steps, evals, registrations, chat) is guarded —
 *     a person is matched by display_name within the course before creating,
 *     and content blocks are skipped if a marker row already exists. Safe to
 *     re-run.
 *
 * Run: cd viewer && node --env-file=../.env scripts/seed-pickleball-full.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) {
  console.error("missing SUPABASE_URL / SUPABASE_SERVICE_KEY");
  process.exit(2);
}
const svc = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OWNER = "kevyao@gmail.com";
const PLAYER_COURSE = "Pickleball Demo — Players";
const COACH_COURSE = "Pickleball Demo — Coaches";

const today = new Date();
const iso = (d) => new Date(d).toISOString();
const dayOffset = (n) => iso(today.getTime() + n * 864e5);
const dayDate = (n) => dayOffset(n).slice(0, 10);

// Known demo passwords so the printed logins are testable. Re-running resets
// these for the player/coach we print.
const DEMO_PLAYER_PW = "PbPlayerDemo!2026";
const DEMO_COACH_PW = "PbCoachDemo!2026";

// ===========================================================================
// RESEARCHED CONTENT
// ===========================================================================

// Rating-band programs for the PLAYER course.
const PLAYER_PROGRAMS = [
  { name: "Intro to Pickleball", description: "Rules, scoring, ready position, the underhand serve and the kitchen rule — true first-timers.", level_min: 1.0, level_max: 2.0, sort_order: 0 },
  { name: "Beginner Fundamentals (2.0–2.5)", description: "Consistent serve + deep return, first dinks, getting to the kitchen line — IPTPA 2.5.", level_min: 2.0, level_max: 2.5, sort_order: 1 },
  { name: "Intermediate Development (3.0–3.5)", description: "Third-shot drop, transition-zone resets, dinking patience and shot selection — IPTPA 3.0–3.5.", level_min: 3.0, level_max: 3.5, sort_order: 2 },
  { name: "Advanced Strategy (4.0+)", description: "Hands battles, stacking, speed-up windows, pace and patience control — IPTPA 4.0+.", level_min: 4.0, level_max: 5.5, sort_order: 3 },
];

// Coaching-track programs for the COACH course.
const COACH_PROGRAMS = [
  { name: "Coach Track — IPTPA Level I Prep", description: "On-court teaching methodology, ball-feeding, drill design, the IPTPA Level I assessment.", level_min: null, level_max: null, sort_order: 0 },
  { name: "Coach Track — IPTPA Level II Prep", description: "Advanced player development, the IPTPA Level II skills test, lesson-planning curriculum.", level_min: null, level_max: null, sort_order: 1 },
];

// Researched drill library (demo videos are real YouTube links).
const DRILLS = [
  { name: "Serve Accuracy Shootout", skill_tags: ["serve"], level_min: 2, level_max: 4, solo_or_partner: "solo", description: "Place targets deep in the middle and in each back corner of the service box, then serve to hit each zone, following through so the paddle points at the target. Builds consistent depth and placement on the serve.", demo_video_url: "https://www.youtube.com/watch?v=v05SxT0l0RU" },
  { name: "Power Serve Loading Drill", skill_tags: ["serve"], level_min: 3, level_max: 5, solo_or_partner: "solo", description: "Load weight on the back foot with knees bent, then transfer through to the front foot to add pace from the legs rather than the arm. Adds 10+ mph while keeping the serve legal and deep.", demo_video_url: "https://www.youtube.com/watch?v=AcCIg43xf_M" },
  { name: "Deep Return Target Zone", skill_tags: ["return", "footwork"], level_min: 2.5, level_max: 4, solo_or_partner: "partner", description: "Place cones a few feet inside the baseline and aim every return to land in the deep target band, splitting and turning sideways as the serve is struck. A deep low return buys time to advance to the kitchen.", demo_video_url: "https://www.youtube.com/watch?v=aiy9c8uR374" },
  { name: "Serve & Return Footwork Builder", skill_tags: ["return", "serve"], level_min: 2, level_max: 3.5, solo_or_partner: "partner", description: "Partners rally serve-to-return focusing on a sideways unit turn and a follow-through toward the target. Grooves a repeatable serve and a low, deep return under realistic pacing.", demo_video_url: "https://www.youtube.com/watch?v=fs62paY8JoY" },
  { name: "Clock-Face Cooperative Dinking", skill_tags: ["dink"], level_min: 2.5, level_max: 4, solo_or_partner: "partner", description: "Two players sustain a cooperative dink rally, working around the 'clock face' to cross-court and down-the-line targets while staying balanced at the NVZ line. Builds touch, patience, and directional control.", demo_video_url: "https://www.youtube.com/watch?v=YqrT0fbsjA4" },
  { name: "Kitchen-Line Dink, Speed-Up & Reset Circuit", skill_tags: ["dink", "volley_reset"], level_min: 3, level_max: 5, solo_or_partner: "partner", description: "A four-station circuit cycling through dinking, speed-ups, resets, and blocking from the kitchen line. Trains the transition between soft control and fast hands in one continuous drill.", demo_video_url: "https://www.youtube.com/watch?v=QLI5HMGWI-k" },
  { name: "Touch & Visual-Control Dinking", skill_tags: ["dink"], level_min: 3, level_max: 4.5, solo_or_partner: "partner", description: "Slow, deliberate dink exchange emphasizing watching contact, soft hands, and keeping the ball below net height. Develops the unattackable dink that forces opponents to pop the ball up.", demo_video_url: "https://www.youtube.com/watch?v=2iPPUPcHQLw" },
  { name: "Perfect Third Shot Drop", skill_tags: ["third_shot_drop"], level_min: 3, level_max: 4.5, solo_or_partner: "partner", description: "Move the feet to create space behind the bounce, then make a controlled low-to-high swing at slow-to-medium pace so the ball arcs into the kitchen unattackable. The shot that earns you the net.", demo_video_url: "https://www.youtube.com/watch?v=IX-yFrWSOL8" },
  { name: "Drop in Three Simple Steps", skill_tags: ["third_shot_drop", "footwork"], level_min: 2.5, level_max: 4, solo_or_partner: "partner", description: "Break the third-shot drop into setup, swing path, and follow-through, getting the feet behind the ball before lifting it softly over the net. Fixes the most common cause of drops sailing long.", demo_video_url: "https://www.youtube.com/watch?v=2W0cz0_AKR8" },
  { name: "Forehand & Backhand Drive Technique", skill_tags: ["drive"], level_min: 3, level_max: 5, solo_or_partner: "partner", description: "Step into the ball and brush low-to-high with topspin, turning the body rather than arming the stroke, on both wings. Produces a heavy, dipping drive that sets up the fourth-shot put-away.", demo_video_url: "https://www.youtube.com/watch?v=t63bL5Wsxf8" },
  { name: "Counterpunch Volley", skill_tags: ["volley_reset"], level_min: 3.5, level_max: 5.5, solo_or_partner: "partner", description: "From a compact ready position, redirect incoming pace with a short forward punch from the shoulder, keeping the paddle out front. Lets you absorb and counter a banger's speed-ups without overswinging.", demo_video_url: "https://www.youtube.com/watch?v=nnYf34pXK-c" },
  { name: "Pro Punch-Volley Hands Battle", skill_tags: ["volley_reset", "strategy"], level_min: 4, level_max: 5.5, solo_or_partner: "partner", description: "Feed a dead dink, partner speeds it up, then play out the hands battle with firm compact punch volleys aimed at the opponent's body. Sharpens reaction time and target discipline in fast exchanges.", demo_video_url: "https://www.youtube.com/watch?v=wPLokm_qElg" },
  { name: "Fast-Hands Wall Volley", skill_tags: ["volley_reset", "footwork"], level_min: 2.5, level_max: 4.5, solo_or_partner: "wall", description: "Rally continuous volleys against a wall with a compact paddle-out-front motion, increasing speed as control improves. Hundreds of reps in minutes to quicken hands and steady the block.", demo_video_url: "https://www.youtube.com/watch?v=IHb5lcnYDC8" },
  { name: "Defend the Overhead Smash", skill_tags: ["lob_overhead"], level_min: 3, level_max: 5, solo_or_partner: "partner", description: "One player smashes from the net while the defender stays low, gets under the ball, and blocks it high to stay in the rally rather than going for a perfect shot. Survive the attack and reset the point.", demo_video_url: "https://www.youtube.com/watch?v=U7Ft0dKg_H0" },
  { name: "Split-Step Timing & Movement", skill_tags: ["footwork"], level_min: 2, level_max: 4, solo_or_partner: "partner", description: "Time a small split-step hop so both feet land as the opponent contacts the ball, then move laterally to the next shot balanced. The single most important footwork habit for reaction and balance.", demo_video_url: "https://www.youtube.com/watch?v=pWot9yKUUvs" },
  { name: "Footwork Masterclass Circuit", skill_tags: ["footwork", "court_positioning"], level_min: 3, level_max: 5, solo_or_partner: "solo", description: "A five-drill agility circuit covering shuffle steps, recovery, and transition movement through the court. Builds the efficient movement patterns that keep you square and ready at every shot.", demo_video_url: "https://m.youtube.com/watch?v=I7Xl4w9vy2U" },
  { name: "Stack the Right Way", skill_tags: ["court_positioning", "strategy"], level_min: 3.5, level_max: 5.5, solo_or_partner: "partner", description: "Learn to stack on serve so each partner finishes the point on their stronger side, keeping forehands in the middle. Start on the serve side for the cleanest structure before adding return-side stacking.", demo_video_url: "https://www.youtube.com/watch?v=f0Ri0xON8zo" },
  { name: "Partner Court Positioning", skill_tags: ["court_positioning", "strategy"], level_min: 3, level_max: 5, solo_or_partner: "partner", description: "Practice moving as a connected unit, shifting toward the ball together and covering the middle so no gap opens between partners. Teaches the spacing and communication that wins doubles points.", demo_video_url: "https://www.youtube.com/watch?v=kQpDbBXWIVo" },
];

// Player roster. `scores` keys map to the assessment skill matrix.
const PLAYERS = [
  {
    display_name: "Marcy Ellison", age: 58, dupr: 2.1, overall_level: 2.5, goal: "fun",
    sports_background: "Played recreational tennis doubles in her 30s; came to pickleball through a neighborhood open house and now plays twice a week with friends.",
    referred_by: "Open house",
    scores: { serve: 2.5, return: 2, dink: 1.5, drive: 2.5, third_shot_drop: 1, volley_reset: 1.5, lob_overhead: 2, footwork: 2, court_positioning: 2, strategy: 1.5 },
    weak: ["Serve Accuracy Shootout", "Deep Return Target Zone"],
    lessons: [
      { status: "recapped", program: "Beginner Fundamentals (2.0–2.5)", offset: -7, plan_md: "## Goal: Consistent serve + return\nFirst private. Build a repeatable underhand serve she can land 8/10 and a deep return that buys time to reach the kitchen line.\n\n- **Warm-up (10 min):** mid-court dink-free rally to feel paddle face\n- **Serve (20 min):** drop-serve, focus on contact below waist, target deep-middle\n- **Return (15 min):** deep return + 'return and run' to the NVZ line\n- **Game situation (10 min):** serve/return only, no third shot yet", recap_md: "Marcy's serve clicked once we switched her to the **drop serve** — she went from 4/10 in to 9/10 in by the end. Return depth is still short (landing mid-court), which lets opponents attack. Homework: 50 deep returns against the wall before next session. She's having a blast and that's the win here. Next time we introduce the **third-shot drop** lightly.", video: "Deep Return Target Zone" },
    ],
  },
  {
    display_name: "Dev Patel", age: 24, dupr: 2.8, overall_level: 3, goal: "fitness",
    sports_background: "Former high-school badminton player. Fast hands and great court coverage, but translating the badminton wrist into a controlled pickleball soft game is a work in progress.",
    referred_by: "Marcy Ellison",
    scores: { serve: 3, return: 3, dink: 2, drive: 3.5, third_shot_drop: 2, volley_reset: 2, lob_overhead: 2.5, footwork: 3.5, court_positioning: 2.5, strategy: 2.5 },
    weak: ["Perfect Third Shot Drop", "Kitchen-Line Dink, Speed-Up & Reset Circuit"],
    lessons: [
      { status: "recapped", program: "Intermediate Development (3.0–3.5)", offset: -6, plan_md: "## Goal: Trade the bash for a soft game\nDev wins points with speed but loses them when he bangs from the baseline. Today we slow him down.\n\n- **Dink ladder (20 min):** straight-ahead, then cross-court, counting unforced errors\n- **Third-shot drop (20 min):** from the transition zone, soft arc into the kitchen\n- **Drill:** 'no drive' game — every third shot MUST be a drop", recap_md: "Dev's hands are genuinely a weapon at the net — his badminton volley speed is real. The problem is patience: he drove 6 of his first 10 third shots into the net. By the end of the 'no drive' game his drop landed soft ~5/10, which is progress from ~2/10. He hates resetting (wants to attack everything) so that's our next frontier.", video: "Perfect Third Shot Drop" },
      { status: "scheduled", program: "Intermediate Development (3.0–3.5)", offset: 4, plan_md: "## Goal: Resets under pressure\nDev gets sped up at the net and pops balls up. Today we build a reliable **reset** — absorbing pace and dropping the ball back into the kitchen instead of countering everything.\n\n- **Hands battle → reset (25 min):** coach feeds hard at the body, Dev resets soft\n- **Paddle-face/soft-hands work:** loose grip, out front, no backswing\n- **Score it:** 10-ball reset challenge, reset 6+ to 'win'", recap_md: "" },
    ],
  },
  {
    display_name: "Karen Whitfield", age: 47, dupr: 3.2, overall_level: 3.5, goal: "skill",
    sports_background: "Lifelong club tennis player (4.0 USTA). Strong groundstrokes and serve, but the tennis instinct to hit hard and stand back is costing her at the kitchen line.",
    referred_by: "Open house",
    scores: { serve: 3.5, return: 4, dink: 2.5, drive: 4, third_shot_drop: 2.5, volley_reset: 2.5, lob_overhead: 3, footwork: 3.5, court_positioning: 3, strategy: 3 },
    weak: ["Touch & Visual-Control Dinking", "Drop in Three Simple Steps"],
    lessons: [
      { status: "recapped", program: "Intermediate Development (3.0–3.5)", offset: -5, plan_md: "## Goal: Unlearn the tennis baseline habit\nKaren's drives are clean but she's parked behind the baseline. Today: get her TO the kitchen and comfortable staying there.\n\n- **Third-shot drop + advance (25 min):** drop, then split-step in two steps closer\n- **Dink exchange (15 min):** staying patient at the line, not driving the first high ball\n- **Concept:** 'the kitchen line is home, the baseline is a visit'", recap_md: "Classic tennis-to-pickleball transition. Karen's third-shot drop is mechanically fine — the issue was she dropped and then *stayed back* out of habit, surrendering the net. We drilled drop-and-advance and by the end she was getting to the line 7/10 third shots. Her dink patience needs work; she still drives the first ball that's even slightly high. Filmed her footwork — sending the clip.", video: "Drop in Three Simple Steps" },
    ],
  },
  {
    display_name: "Marcus Tran", age: 31, dupr: 3.6, overall_level: 3.75, goal: "competition",
    sports_background: "Played D3 club volleyball. Athletic, great net anticipation and blocking instincts. Wants to start playing 3.5/4.0 local tournaments this season.",
    referred_by: "Dev Patel",
    scores: { serve: 3.5, return: 3.5, dink: 3.5, drive: 3.5, third_shot_drop: 3.5, volley_reset: 3.5, lob_overhead: 3, footwork: 4, court_positioning: 3.5, strategy: 3.5 },
    weak: ["Stack the Right Way", "Pro Punch-Volley Hands Battle"],
    lessons: [
      { status: "recapped", program: "Advanced Strategy (4.0+)", offset: -8, plan_md: "## Goal: Tournament-ready stacking + signals\nMarcus has the shots; now we build the doubles IQ for competitive play.\n\n- **Stacking (20 min):** keeping his forehand in the middle, footwork off the serve/return\n- **Poaching + signals (20 min):** reading the dink-to-attack window, hand signals with a partner\n- **Erne intro (10 min):** when and how to jump the kitchen", recap_md: "Marcus is closer to 4.0 than his DUPR shows — the gap is purely strategic, not physical. Stacking clicked fast (volleyball rotations helped). His poaching instinct is excellent but he over-poaches and leaves his partner exposed; we worked on the 'commit fully or don't move' rule. The Erne is a fun toy he'll overuse for two weeks then settle down. He's ready for a 3.5 bracket now, 4.0 by fall.", video: "Stack the Right Way" },
      { status: "scheduled", program: "Advanced Strategy (4.0+)", offset: 5, plan_md: "## Goal: Pre-tournament tune-up\nLast session before the Summer Slam 3.5 bracket. Sharpen, don't rebuild.\n\n- **Serve/return targets (15 min):** depth + placement under simulated pressure\n- **Pressure dinking (15 min):** first-to-attack patience battles\n- **Match-play sets:** play out points, coach calls the score loud to simulate nerves", recap_md: "" },
    ],
  },
  {
    display_name: "Sofia Reyes", age: 39, dupr: 4, overall_level: 4.25, goal: "competition",
    sports_background: "Competitive racquetball player for 15 years. Lethal hand speed and a wicked backhand flick; transitioned to pickleball two years ago and already medals in 4.0 local opens.",
    referred_by: "Marcus Tran",
    scores: { serve: 4, return: 4, dink: 4, drive: 4.5, third_shot_drop: 4, volley_reset: 4, lob_overhead: 3.5, footwork: 4.5, court_positioning: 4, strategy: 4 },
    weak: ["Defend the Overhead Smash", "Counterpunch Volley"],
    lessons: [
      { status: "recapped", program: "Advanced Strategy (4.0+)", offset: -4, plan_md: "## Goal: Close the 4.0→4.5 gap\nSofia's offense is elite. The ceiling is shot selection — knowing when NOT to flick.\n\n- **Video review (15 min):** last tournament match, mark every low-percentage flick\n- **Speed-up windows (25 min):** drilling ONLY attackable balls (above net, off the bounce)\n- **Targeting:** speed-ups at the dominant-shoulder/right-hip, not the open court", recap_md: "Sofia's racquetball hands are genuinely 4.5+. The leak is discipline: she speeds up off balls that are too low and gets countered. Video made it obvious — 4 of her 7 errors in that match were speed-ups from below the net. We built a clear rule: 'only attack the ball you can take above the tape.' Her targeting also improved — going at the body instead of the sideline cut her errors in half over the session. Lob is her one soft spot; she rarely uses it and her overhead is just okay.", video: "Counterpunch Volley" },
    ],
  },
  {
    display_name: "Greg Halvorsen", age: 63, dupr: 3.4, overall_level: 3.5, goal: "fitness",
    sports_background: "Retired, picked up pickleball three years ago for the cardio and the social side. Smart, patient dinker but limited mobility means he relies on positioning over speed.",
    referred_by: "Greg's wife (Linda)",
    scores: { serve: 3, return: 3, dink: 4, drive: 2.5, third_shot_drop: 3.5, volley_reset: 3.5, lob_overhead: 3.5, footwork: 2.5, court_positioning: 4, strategy: 4 },
    weak: ["Split-Step Timing & Movement", "Footwork Masterclass Circuit"],
    lessons: [
      { status: "recapped", program: "Intermediate Development (3.0–3.5)", offset: -9, plan_md: "## Goal: Win with the brain, not the legs\nGreg can't run people down, so we lean into court IQ and shot placement.\n\n- **Dink targeting (20 min):** cross-court to the sideline corner to pull opponents wide\n- **Lob as a tool (15 min):** offensive lob over the non-dominant shoulder\n- **Positioning (15 min):** controlling the middle, partner communication", recap_md: "Greg is the best dinker in his rec group and it's not close — patient, deep, and he targets the corner well. We added an offensive lob to his kit since he can't win a hands battle, and it's a great equalizer against younger bangers. The honest limiter is lateral footwork; we worked on the **first split-step** so he's at least set early. He'll never be fast but he plays the angles better than players two levels above him. A real pleasure to coach.", video: "Split-Step Timing & Movement" },
    ],
  },
  {
    display_name: "Priya Nair", age: 19, dupr: 4.4, overall_level: 4.75, goal: "competition",
    sports_background: "College tennis player (Division II) playing pickleball in the off-season. Big serve, huge forehand drive, and athletic to a fault — over-relies on power and is learning the patience the pro game demands.",
    referred_by: "Sofia Reyes",
    scores: { serve: 4.5, return: 4.5, dink: 4, drive: 5, third_shot_drop: 4, volley_reset: 4, lob_overhead: 4, footwork: 5, court_positioning: 4, strategy: 4 },
    weak: ["Touch & Visual-Control Dinking", "Forehand & Backhand Drive Technique"],
    lessons: [
      { status: "scheduled", program: "Advanced Strategy (4.0+)", offset: 3, plan_md: "## Goal: Build the patience to match the power\nPriya can end any point — the question is whether she ends it on HER terms or rushes it. Today: discipline under the temptation to rip.\n\n- **Extended dink rallies (20 min):** minimum 8 dinks before anyone may attack\n- **Drive-to-drop conversion (20 min):** when the drive draws a pop-up vs. when to reset\n- **Shot-tolerance scoring:** lose a point for any attack from below net height", recap_md: "" },
    ],
  },
];

// Events / clinics for the PLAYER course.
const EVENTS = [
  { name: "Intro to Pickleball: Absolute Beginners", type: "clinic", capacity: 8, skill_min: null, skill_max: 2.5, offset: 6, description: "A no-experience-needed clinic covering grip, the underhand serve, scoring, and the kitchen rule, with paddles provided." },
  { name: "Third-Shot Drop & Soft Game Workshop", type: "clinic", capacity: 6, skill_min: 3, skill_max: 4, offset: 9, description: "A focused two-hour deep dive on the third-shot drop, dinking patience, and resetting under pressure for players ready to get off the baseline." },
  { name: "Friday Night Round-Robin Social", type: "social", capacity: 16, skill_min: null, skill_max: null, offset: 4, description: "Open-level rotating-partner round robin with music, light snacks, and prizes — all levels welcome to mix and meet the academy community." },
  { name: "IPTPA Skills Assessment Day", type: "clinic", capacity: 12, skill_min: 2.5, skill_max: null, offset: 14, description: "An official IPTPA Player Skills Rating assessment where a certified rater evaluates your strokes and assigns a verified skill rating." },
  { name: "Competitive Players Weekend Camp", type: "camp", capacity: 10, skill_min: 3.5, skill_max: 5, offset: 21, description: "A two-day intensive on stacking, speed-up windows, poaching, and tournament strategy for players preparing for 3.5+ bracket play." },
];

// Which players register into which events (by display_name). Registrations
// beyond capacity become waitlisted automatically.
const EVENT_SIGNUPS = {
  "Intro to Pickleball: Absolute Beginners": ["Marcy Ellison", "Greg Halvorsen"],
  "Third-Shot Drop & Soft Game Workshop": ["Dev Patel", "Karen Whitfield", "Marcus Tran"],
  "Friday Night Round-Robin Social": ["Marcy Ellison", "Dev Patel", "Karen Whitfield", "Marcus Tran", "Sofia Reyes", "Greg Halvorsen", "Priya Nair"],
  "IPTPA Skills Assessment Day": ["Marcy Ellison", "Dev Patel", "Karen Whitfield", "Greg Halvorsen"],
  "Competitive Players Weekend Camp": ["Marcus Tran", "Sofia Reyes", "Priya Nair"],
};

// Player-course chat (owner + a couple players). sender names resolve to ids.
const PLAYER_CHAT = [
  { sender: OWNER, body: "Welcome to the academy chat! Drop your questions here — I'll post court assignments and weather calls in this channel.", offset: -10, hour: 9 },
  { sender: "Dev Patel", body: "Thanks coach! Quick one — are paddles provided for the Friday social or should I bring my own?", offset: -9, hour: 18 },
  { sender: OWNER, body: "Bring your own if you have one, Dev. We'll have loaners for anyone who needs them.", offset: -9, hour: 18, minute: 20 },
  { sender: "Marcy Ellison", body: "So excited for the beginner clinic — first time touching a paddle! 😅", offset: -8, hour: 8 },
  { sender: OWNER, body: "You'll do great, Marcy. Wear court shoes and bring water — it gets warm on Court 1 by mid-morning.", offset: -8, hour: 8, minute: 15 },
  { sender: "Marcus Tran", body: "Anyone want to get reps in before the competitive camp? Looking for a hitting partner this weekend.", offset: -3, hour: 12 },
];

// IPTPA certifications catalog (for coaches).
const CERT_CATALOG = [
  { name: "IPTPA Level I Certified Pickleball Instructor", issuing_body: "International Pickleball Teaching Professional Association (IPTPA)", level: "Level I" },
  { name: "IPTPA Level II Teaching Professional", issuing_body: "International Pickleball Teaching Professional Association (IPTPA)", level: "Level II" },
  { name: "PPR Pickleball Certified Professional", issuing_body: "Professional Pickleball Registry (PPR)", level: "Professional" },
  { name: "USA Pickleball Ambassador / Official Certification", issuing_body: "USA Pickleball", level: "Certified" },
  { name: "CPR & First Aid Certification", issuing_body: "American Red Cross", level: "Current" },
];

// Coach roster for the COACH course.
const COACHES = [
  {
    display_name: "Coach Tony Marchetti", years_played: 8,
    bio: "Former tennis teaching pro who fell hard for pickleball in 2018 and never looked back. Tony specializes in transitioning tennis and racquetball players and is the academy's go-to for the soft game and shot selection.",
    certs: [
      { name: "Certified Pickleball Teaching Professional", issuing_body: "IPTPA", level: "Level II" },
      { name: "Professional Pickleball Registry Coach", issuing_body: "PPR", level: "Certified" },
    ],
    evaluation: { instruction: 5, communication: 5, safety: 4, retention: 5, notes: "Tony's the one I'd put with any player above 3.5 — his shot-selection eye is the best on staff and students adore him. Only growth area is remembering to slow the pace for true beginners." },
    levelII: true,
  },
  {
    display_name: "Coach Dani Brooks", years_played: 4,
    bio: "A former collegiate volleyball libero who brings relentless energy and a gift for making nervous beginners feel at home. Dani runs the academy's intro clinics and Friday socials and is the warmest presence on court.",
    certs: [
      { name: "Certified Pickleball Teaching Professional", issuing_body: "IPTPA", level: "Level I" },
    ],
    evaluation: { instruction: 4, communication: 5, safety: 5, retention: 5, notes: "Dani is our beginner-whisperer — retention in her intro clinics is the highest in the building because people leave smiling. She's working toward IPTPA Level II to round out her technical depth on the soft game." },
    levelII: false,
  },
  {
    display_name: "Coach Reggie Okafor", years_played: 5,
    bio: "A rising competitive player (4.5 DUPR) who coaches the camp and tournament-prep crowd. Reggie is technical, drill-heavy, and great with ambitious players, though still developing the patience for slower-paced lessons.",
    certs: [
      { name: "Professional Pickleball Registry Coach", issuing_body: "PPR", level: "Certified" },
      { name: "CPR/AED Certification", issuing_body: "American Red Cross", level: "Current" },
    ],
    evaluation: { instruction: 4, communication: 4, safety: 5, retention: 4, notes: "Reggie's drills are sharp and his competitive players improve fast. The development note is communication tone — he coaches everyone like they're tournament-bound, which can overwhelm rec players. Pairing him with the camp/competition track plays to his strengths." },
    levelII: false,
  },
];

// Coach-course chat (owner + a couple coaches).
const COACH_CHAT = [
  { sender: OWNER, body: "Staff channel is live. Post your hours weekly and flag any students you think are ready to level up. Let's build the best academy in the region.", offset: -12, hour: 17 },
  { sender: "Coach Dani Brooks", body: "Just signed up for the IPTPA Level II workshop next month — excited to deepen the soft-game side!", offset: -10, hour: 11 },
  { sender: OWNER, body: "Love it, Dani. Shadow a couple of Tony's 3.5 lessons before then — his dink progression is gold.", offset: -10, hour: 11, minute: 30 },
  { sender: "Coach Tony Marchetti", body: "Happy to have you shadow anytime, Dani. I've got two intermediate privates Thursday.", offset: -9, hour: 14 },
  { sender: "Coach Reggie Okafor", body: "Camp roster is full — 10 players, all 3.5+. Building the stacking + speed-up block now.", offset: -2, hour: 16 },
];

// IPTPA skill criteria + dev milestone templates (kept inline as detail text).
const DEV_TEMPLATE = [
  { title: "Complete IPTPA Level I certification workshop, written exam, and observed teaching lesson", step_type: "cert", auto_threshold: null },
  { title: "Log 20 hours of supervised on-court coaching / ball-feeding practice", step_type: "hours", auto_threshold: 20 },
  { title: "Shadow a Level II teaching professional for 5 lessons before leading solo", step_type: "shadow", auto_threshold: 5 },
  { title: "Pass the IPTPA Level II skills test (80%+ accuracy on dinks, drops, volleys, drives, serves, overheads) and observed lesson", step_type: "cert", auto_threshold: null },
  { title: "Read and apply the IPTPA Instructor Handbook lesson-planning curriculum", step_type: "manual", auto_threshold: null },
];

// ===========================================================================
// HELPERS
// ===========================================================================

async function getOwner() {
  const { data, error } = await svc.from("profiles").select("id").eq("email", OWNER).single();
  if (error || !data) throw new Error(`owner ${OWNER} not found — bootstrap the admin first.`);
  return data.id;
}

async function findCourse(name, ownerId) {
  const { data } = await svc
    .from("courses")
    .select("id, short_code")
    .eq("name", name)
    .eq("teacher_id", ownerId)
    .maybeSingle();
  return data || null;
}

// find-or-create a parent row keyed by `match`; returns its id.
async function ensure(table, match, row) {
  const { data } = await svc.from(table).select("id").match(match).maybeSingle();
  if (data) return data.id;
  const { data: ins, error } = await svc.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return ins.id;
}

// Resolve a person already enrolled in `courseId` by display_name. Returns
// { id } or null.
async function findEnrolledByName(courseId, displayName) {
  const { data: members } = await svc
    .from("course_memberships")
    .select("student_id")
    .eq("course_id", courseId);
  const ids = (members || []).map((m) => m.student_id);
  if (!ids.length) return null;
  const { data: profs } = await svc
    .from("profiles")
    .select("id, display_name")
    .in("id", ids)
    .eq("display_name", displayName);
  return profs && profs.length ? { id: profs[0].id } : null;
}

// Create an auth user with a known password (or reset password if reusing),
// set display_name, enroll in the course. Returns { id, email, password }.
async function createOrResetPerson(courseId, displayName, emailPrefix, password) {
  const existing = await findEnrolledByName(courseId, displayName);
  if (existing) {
    // Reset password so the printed login stays valid, and refresh display_name.
    await svc.auth.admin.updateUserById(existing.id, { password });
    await svc.from("profiles").update({ display_name: displayName }).eq("id", existing.id);
    const { data: prof } = await svc.from("profiles").select("email").eq("id", existing.id).maybeSingle();
    return { id: existing.id, email: prof?.email || "(existing)", password, reused: true };
  }
  const email = `${emailPrefix}-${randomBytes(3).toString("hex")}@example.com`;
  const { data: u, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${displayName}: ${error.message}`);
  await svc.from("profiles").update({ display_name: displayName }).eq("id", u.user.id);
  await svc.from("course_memberships").insert({ course_id: courseId, student_id: u.user.id });
  return { id: u.user.id, email, password, reused: false };
}

async function senderId(courseId, who, ownerId) {
  if (who === OWNER) return ownerId;
  const p = await findEnrolledByName(courseId, who);
  return p ? p.id : ownerId;
}

// goal value normalization (CHECK allows fun|fitness|competition|skill)
function normalizeGoal(g) {
  return ["fun", "fitness", "competition", "skill"].includes(g) ? g : "skill";
}

// ===========================================================================
// PLAYER COURSE
// ===========================================================================

async function seedPlayerCourse(PC, ownerId, drillIds, progIds) {
  let firstPlayerLogin = null;

  for (let pi = 0; pi < PLAYERS.length; pi++) {
    const p = PLAYERS[pi];
    const isDemoPrint = pi === 0; // print Marcy's login
    const pw = isDemoPrint ? DEMO_PLAYER_PW : "PbPlayer!" + randomBytes(4).toString("hex");
    const person = await createOrResetPerson(PC.id, p.display_name, "pb-player", pw);
    if (isDemoPrint) firstPlayerLogin = person;

    // player profile (idempotent via UNIQUE(course_id, student_id))
    await ensure(
      "pickleball_player_profiles",
      { course_id: PC.id, student_id: person.id },
      {
        course_id: PC.id,
        student_id: person.id,
        years_played: Math.max(1, Math.round((p.dupr - 2) * 2)),
        sports_background: p.sports_background,
        goal: normalizeGoal(p.goal),
        goal_notes: `Age ${p.age}. ${p.sports_background}`,
        referred_by: p.referred_by,
        skill_level: String(p.overall_level),
        dupr: p.dupr,
        dominant_hand: "right",
        start_date: dayDate(-Math.round((p.dupr - 1.5) * 60)),
      }
    );

    // intake assessment (seed-once: skip if any assessment exists for this player)
    const { data: existingA } = await svc
      .from("pickleball_assessments")
      .select("id")
      .eq("course_id", PC.id)
      .eq("player_id", person.id)
      .limit(1);
    if (!existingA?.length) {
      const weakest = Object.entries(p.scores)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .map(([k]) => k.replace(/_/g, " "))
        .join(", ");
      await svc.from("pickleball_assessments").insert({
        course_id: PC.id,
        player_id: person.id,
        coach_id: ownerId,
        type: "intake",
        scores: p.scores,
        overall_level: p.overall_level,
        notes: `IPTPA Player Skills Rating (intake). Overall ${p.overall_level}. Development priorities: ${weakest}.`,
      });
    }

    // lessons (+ a real demo video link on recapped ones) — seed-once per player
    const { data: existingL } = await svc
      .from("pickleball_lessons")
      .select("id")
      .eq("course_id", PC.id)
      .eq("player_id", person.id)
      .limit(1);
    if (!existingL?.length) {
      for (const l of p.lessons) {
        const { data: lesson, error: lerr } = await svc
          .from("pickleball_lessons")
          .insert({
            course_id: PC.id,
            player_id: person.id,
            coach_id: ownerId,
            program_id: progIds[l.program] || null,
            scheduled_at: dayOffset(l.offset),
            duration_min: 60,
            location: "Court 1",
            status: l.status,
            plan_md: l.plan_md,
            recap_md: l.recap_md || null,
          })
          .select("id")
          .single();
        if (lerr) throw new Error(`lesson ${p.display_name}: ${lerr.message}`);
        // attach ONE real demo video (as a link) for recapped lessons that name one
        if (l.status === "recapped" && l.video && drillIds[l.video]) {
          const drill = DRILLS.find((d) => d.name === l.video);
          if (drill?.demo_video_url) {
            await svc.from("pickleball_lesson_videos").insert({
              lesson_id: lesson.id,
              kind: "link",
              url: drill.demo_video_url,
              title: `Demo: ${l.video}`,
              sort_order: 0,
              added_by: ownerId,
            });
          }
        }
      }
    }

    // homework targeting weak skills — seed-once per player
    const { data: existingH } = await svc
      .from("pickleball_homework")
      .select("id")
      .eq("course_id", PC.id)
      .eq("player_id", person.id)
      .limit(1);
    if (!existingH?.length) {
      for (const dn of p.weak) {
        if (!drillIds[dn]) continue;
        await svc.from("pickleball_homework").insert({
          course_id: PC.id,
          player_id: person.id,
          drill_id: drillIds[dn],
          assigned_by: ownerId,
          due_on: dayDate(7),
          status: "assigned",
        });
      }
    }
  }
  console.log(`✓ ${PLAYERS.length} players: profiles + intake assessments + lessons (w/ demo videos) + homework`);

  // ---- EVENTS + REGISTRATIONS ----
  const eventIds = {};
  for (const e of EVENTS) {
    eventIds[e.name] = await ensure(
      "pickleball_events",
      { course_id: PC.id, name: e.name },
      {
        course_id: PC.id,
        coach_id: ownerId,
        name: e.name,
        type: e.type,
        description: e.description,
        status: "published",
        location: "Court 1",
        starts_at: dayOffset(e.offset),
        ends_at: dayOffset(e.offset),
        capacity: e.capacity,
        skill_min: e.skill_min,
        skill_max: e.skill_max,
        registration_opens_at: dayOffset(-3),
        registration_closes_at: dayOffset(e.offset - 1),
      }
    );
  }
  console.log(`✓ ${EVENTS.length} events (published)`);

  // register players (respect capacity -> waitlist the overflow)
  let regCount = 0;
  let waitCount = 0;
  for (const e of EVENTS) {
    const eventId = eventIds[e.name];
    const signups = EVENT_SIGNUPS[e.name] || [];
    let registered = 0;
    let waitRank = 0;
    for (let i = 0; i < signups.length; i++) {
      const person = await findEnrolledByName(PC.id, signups[i]);
      if (!person) continue;
      // already registered? (UNIQUE(event_id, player_id))
      const { data: existing } = await svc
        .from("pickleball_event_registrations")
        .select("id")
        .eq("event_id", eventId)
        .eq("player_id", person.id)
        .maybeSingle();
      if (existing) continue;
      const overCap = e.capacity != null && registered >= e.capacity;
      const row = {
        event_id: eventId,
        course_id: PC.id,
        player_id: person.id,
        state: overCap ? "waitlisted" : "registered",
        registered_at: dayOffset(-2 + i * 0.01),
      };
      if (overCap) {
        waitRank += 1;
        row.waitlist_rank = waitRank;
      }
      const { error } = await svc.from("pickleball_event_registrations").insert(row);
      if (error) throw new Error(`registration ${e.name}/${signups[i]}: ${error.message}`);
      if (overCap) waitCount += 1;
      else registered += 1, (regCount += 1);
    }
  }
  console.log(`✓ ${regCount} registrations + ${waitCount} waitlisted`);

  // ---- CHAT ----
  const { data: chatExists } = await svc
    .from("pickleball_chat_messages")
    .select("id")
    .eq("course_id", PC.id)
    .limit(1);
  if (!chatExists?.length) {
    for (const m of PLAYER_CHAT) {
      const sid = await senderId(PC.id, m.sender, ownerId);
      const when = new Date(today.getTime() + m.offset * 864e5);
      when.setHours(m.hour ?? 12, m.minute ?? 0, 0, 0);
      await svc.from("pickleball_chat_messages").insert({
        course_id: PC.id,
        sender_id: sid,
        body: m.body,
        created_at: iso(when),
      });
    }
    console.log(`✓ ${PLAYER_CHAT.length} player-course chat messages`);
  } else {
    console.log("• player chat already present — skipped");
  }

  return firstPlayerLogin;
}

// ===========================================================================
// COACH COURSE
// ===========================================================================

async function seedCoachCourse(CC, ownerId, progIds) {
  let firstCoachLogin = null;

  for (let ci = 0; ci < COACHES.length; ci++) {
    const c = COACHES[ci];
    const isDemoPrint = ci === 0; // print Tony's login
    const pw = isDemoPrint ? DEMO_COACH_PW : "PbCoach!" + randomBytes(4).toString("hex");
    const person = await createOrResetPerson(CC.id, c.display_name, "pb-coach", pw);
    if (isDemoPrint) firstCoachLogin = person;

    // coach profile (idempotent via UNIQUE(course_id, coach_id))
    await ensure(
      "pickleball_coach_profiles",
      { course_id: CC.id, coach_id: person.id },
      {
        course_id: CC.id,
        coach_id: person.id,
        years_played: c.years_played,
        bio: c.bio,
      }
    );

    // certs — seed-once per coach
    const { data: existingCert } = await svc
      .from("pickleball_certifications")
      .select("id")
      .eq("course_id", CC.id)
      .eq("coach_id", person.id)
      .limit(1);
    if (!existingCert?.length) {
      const certRows = c.certs.map((ct, idx) => ({
        course_id: CC.id,
        coach_id: person.id,
        name: ct.name,
        issuing_body: ct.issuing_body,
        level: ct.level,
        earned_on: dayDate(-120 - idx * 30),
        expires_on: dayDate(610 - idx * 30),
        cert_no: `${(ct.issuing_body || "CERT").replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`,
      }));
      await svc.from("pickleball_certifications").insert(certRows);
    }

    // development track — seed-once per coach
    const { data: existingStep } = await svc
      .from("pickleball_coach_devsteps")
      .select("id")
      .eq("course_id", CC.id)
      .eq("coach_id", person.id)
      .limit(1);
    if (!existingStep?.length) {
      const mkStep = async (row) =>
        (
          await svc
            .from("pickleball_coach_devsteps")
            .insert({ course_id: CC.id, coach_id: person.id, ...row })
            .select("id")
            .single()
        ).data.id;

      // [0] Level I cert workshop — manual/cert, DONE
      await mkStep({
        title: DEV_TEMPLATE[0].title,
        step_type: DEV_TEMPLATE[0].step_type,
        status: "done",
        completed_at: dayOffset(-130),
        detail: "IPTPA Level I: workshop + written exam + observed lesson.",
      });

      // [1] Log supervised hours — AUTO hours step, in progress (~64/100)
      // NOTE: the template threshold is 20; we use a 100-hour goal here so the
      // ~64h logged below shows a partial, still-open progress bar.
      const hoursStep = await mkStep({
        title: "Log 100 supervised on-court coaching / ball-feeding hours",
        step_type: "hours",
        auto_threshold: 100,
        status: "open",
        detail: "Tracked automatically from the hours log.",
      });

      // [2] Shadow a Level II pro — AUTO shadow step (will auto-complete)
      const shadowStep = await mkStep({
        title: DEV_TEMPLATE[2].title,
        step_type: DEV_TEMPLATE[2].step_type,
        auto_threshold: DEV_TEMPLATE[2].auto_threshold, // 5
        status: "open",
        detail: "Auto-completes when 5 mentor-signed shadow sessions are logged.",
      });

      // [3] Level II skills test — cert step (done only for the Level-II coach)
      await mkStep({
        title: DEV_TEMPLATE[3].title,
        step_type: DEV_TEMPLATE[3].step_type,
        status: c.levelII ? "done" : "open",
        completed_at: c.levelII ? dayOffset(-40) : null,
        due_on: c.levelII ? null : dayDate(120),
      });

      // [4] Read & apply the handbook curriculum — manual
      await mkStep({
        title: DEV_TEMPLATE[4].title,
        step_type: DEV_TEMPLATE[4].step_type,
        status: c.levelII ? "done" : "open",
        completed_at: c.levelII ? dayOffset(-20) : null,
      });

      // hours log — ~64 of 100 (step shows progress, stays open)
      const hourEntries = [8, 6, 10, 7, 9, 6, 8, 10];
      for (let i = 0; i < hourEntries.length; i++) {
        await svc.from("pickleball_hours_log").insert({
          course_id: CC.id,
          coach_id: person.id,
          taught_on: dayDate(-(i + 1) * 7),
          hours: hourEntries[i],
          program_id: progIds["Coach Track — IPTPA Level I Prep"] || null,
          num_players: 4,
          notes: i % 2 === 0 ? "Group clinic — ball feeding + dink progression" : "Private lesson block",
        });
      }
      void hoursStep; // the trigger recomputes from the hours log; id kept for clarity

      // shadow logs — insert UNSIGNED, then UPDATE signed_off=true so the
      // AFTER UPDATE trigger recomputes the dev step -> the 5-session shadow
      // step auto-completes.
      const shadowIds = [];
      for (let i = 0; i < 5; i++) {
        const { data, error } = await svc
          .from("pickleball_shadow_logs")
          .insert({
            course_id: CC.id,
            coach_id: person.id,
            mentor_id: ownerId,
            shadow_date: dayDate(-(i + 1) * 10),
            mentor_notes: "Observed a group clinic — good court management and clear cueing.",
            signed_off: false,
          })
          .select("id")
          .single();
        if (error) throw new Error(`shadow ${c.display_name}: ${error.message}`);
        shadowIds.push(data.id);
      }
      await svc
        .from("pickleball_shadow_logs")
        .update({ signed_off: true, signed_off_at: iso(today) })
        .in("id", shadowIds);
      void shadowStep;

      // coach program qualifications: cleared for L-I, training for L-II
      await svc.from("pickleball_coach_programs").insert([
        { course_id: CC.id, coach_id: person.id, program_id: progIds["Coach Track — IPTPA Level I Prep"], status: "cleared" },
        { course_id: CC.id, coach_id: person.id, program_id: progIds["Coach Track — IPTPA Level II Prep"], status: c.levelII ? "cleared" : "training" },
      ]);

      // evaluation
      await svc.from("pickleball_coach_evaluations").insert({
        course_id: CC.id,
        coach_id: person.id,
        evaluator_id: ownerId,
        instruction: c.evaluation.instruction,
        communication: c.evaluation.communication,
        safety: c.evaluation.safety,
        retention: c.evaluation.retention,
        notes: c.evaluation.notes,
      });
    }
  }
  console.log(`✓ ${COACHES.length} coaches: profiles + certs + dev tracks (auto hours+shadow) + programs + evals`);

  // ---- COACH CHAT ----
  const { data: chatExists } = await svc
    .from("pickleball_chat_messages")
    .select("id")
    .eq("course_id", CC.id)
    .limit(1);
  if (!chatExists?.length) {
    for (const m of COACH_CHAT) {
      const sid = await senderId(CC.id, m.sender, ownerId);
      const when = new Date(today.getTime() + m.offset * 864e5);
      when.setHours(m.hour ?? 12, m.minute ?? 0, 0, 0);
      await svc.from("pickleball_chat_messages").insert({
        course_id: CC.id,
        sender_id: sid,
        body: m.body,
        created_at: iso(when),
      });
    }
    console.log(`✓ ${COACH_CHAT.length} coach-course chat messages`);
  } else {
    console.log("• coach chat already present — skipped");
  }

  // sanity: confirm the shadow steps auto-completed
  const { data: shadowSteps } = await svc
    .from("pickleball_coach_devsteps")
    .select("status, auto_completed")
    .eq("course_id", CC.id)
    .eq("step_type", "shadow");
  const autoDone = (shadowSteps || []).filter((s) => s.status === "done").length;
  console.log(`  shadow dev steps auto-completed: ${autoDone}/${(shadowSteps || []).length}`);

  return firstCoachLogin;
}

// ===========================================================================
// MAIN
// ===========================================================================

async function main() {
  const ownerId = await getOwner();
  const PC = await findCourse(PLAYER_COURSE, ownerId);
  const CC = await findCourse(COACH_COURSE, ownerId);
  if (!PC || !CC) {
    throw new Error(
      `Demo courses missing (player=${!!PC}, coach=${!!CC}) — run seed-pickleball-demo.mjs first to create them.`
    );
  }
  console.log(`Owner ${ownerId}`);
  console.log(`Player course ${PC.short_code} (${PC.id})`);
  console.log(`Coach course  ${CC.short_code} (${CC.id})\n`);

  // ---- PROGRAMS (both courses) ----
  const progIds = {};
  for (const p of PLAYER_PROGRAMS) {
    progIds[p.name] = await ensure(
      "pickleball_programs",
      { course_id: PC.id, name: p.name },
      { course_id: PC.id, ...p }
    );
  }
  for (const p of COACH_PROGRAMS) {
    progIds[p.name] = await ensure(
      "pickleball_programs",
      { course_id: CC.id, name: p.name },
      { course_id: CC.id, ...p }
    );
  }
  console.log(`✓ ${PLAYER_PROGRAMS.length} player programs + ${COACH_PROGRAMS.length} coach programs`);

  // ---- DRILLS (player course is the drill library) ----
  const drillIds = {};
  for (const d of DRILLS) {
    drillIds[d.name] = await ensure(
      "pickleball_drills",
      { course_id: PC.id, name: d.name },
      {
        course_id: PC.id,
        name: d.name,
        description: d.description,
        demo_video_url: d.demo_video_url,
        skill_tags: d.skill_tags,
        level_min: d.level_min,
        level_max: d.level_max,
        solo_or_partner: d.solo_or_partner,
        status: "published",
        contributed_by: ownerId,
      }
    );
  }
  console.log(`✓ ${DRILLS.length} drills (published, w/ demo videos)\n`);

  // ---- PLAYER COURSE ----
  const playerLogin = await seedPlayerCourse(PC, ownerId, drillIds, progIds);

  // ---- COACH COURSE ----
  const coachLogin = await seedCoachCourse(CC, ownerId, progIds);

  // ---- SUMMARY ----
  console.log("\n=== DONE — full pickleball demo content seeded ===");
  console.log(
    `Players: ${PLAYERS.length} | Coaches: ${COACHES.length} | Drills: ${DRILLS.length} | Events: ${EVENTS.length} | Programs: ${PLAYER_PROGRAMS.length + COACH_PROGRAMS.length}`
  );
  console.log("\n--- DEMO LOGINS (known passwords; reset on each run) ---");
  if (playerLogin) {
    console.log(`PLAYER  ${PLAYERS[0].display_name}`);
    console.log(`        email:    ${playerLogin.email}`);
    console.log(`        password: ${playerLogin.password}`);
  }
  if (coachLogin) {
    console.log(`COACH   ${COACHES[0].display_name}`);
    console.log(`        email:    ${coachLogin.email}`);
    console.log(`        password: ${coachLogin.password}`);
  }
  console.log(`\nPlayer course:  ${PC.short_code}`);
  console.log(`Coach course:   ${CC.short_code}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
