#!/usr/bin/env node
/**
 * seed-colleges.mjs — populate the public.colleges catalog.
 *
 * Two sources:
 *   1. A curated starter set of ~30 well-known US institutions (default; no key
 *      needed). Facts (name/city/state/type/website) are stable; admit_rate +
 *      deadlines are TYPICAL/REFERENCE values a counselor can edit. Essay
 *      prompts/supplementals have no clean public feed, so they're left for the
 *      management UI.
 *   2. The US Dept. of Education **College Scorecard** API (the authoritative
 *      free source for institution facts). Runs when SCORECARD_API_KEY is set
 *      (free key from https://api.data.gov/signup/). Imports name/city/state/
 *      size/admit_rate/website + scorecard_id, upserting on scorecard_id.
 *
 * Idempotent: curated rows upsert by name; Scorecard rows upsert by scorecard_id.
 *
 * Usage:  node --env-file-if-exists=../.env scripts/seed-colleges.mjs
 *         SCORECARD_API_KEY=... node ... scripts/seed-colleges.mjs --scorecard
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) { console.error("seed-colleges: missing SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(2); }
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// tier-agnostic typical deadlines + light requirements; admin-editable.
const REQ = { rec_letters: 2, test_optional: true };
// [name, city, state, type, admit_rate, deadlines, website]
const CURATED = [
  ["Massachusetts Institute of Technology", "Cambridge", "MA", "private", 0.04, { EA: "Nov 1", RD: "Jan 1" }, "https://mitadmissions.org"],
  ["Stanford University", "Stanford", "CA", "private", 0.04, { REA: "Nov 1", RD: "Jan 5" }, "https://admission.stanford.edu"],
  ["Harvard University", "Cambridge", "MA", "private", 0.03, { REA: "Nov 1", RD: "Jan 1" }, "https://college.harvard.edu"],
  ["Princeton University", "Princeton", "NJ", "private", 0.04, { REA: "Nov 1", RD: "Jan 1" }, "https://admission.princeton.edu"],
  ["Yale University", "New Haven", "CT", "private", 0.05, { REA: "Nov 1", RD: "Jan 2" }, "https://admissions.yale.edu"],
  ["Columbia University", "New York", "NY", "private", 0.04, { ED: "Nov 1", RD: "Jan 1" }, "https://undergrad.admissions.columbia.edu"],
  ["University of Pennsylvania", "Philadelphia", "PA", "private", 0.06, { ED: "Nov 1", RD: "Jan 5" }, "https://admissions.upenn.edu"],
  ["Brown University", "Providence", "RI", "private", 0.05, { ED: "Nov 1", RD: "Jan 3" }, "https://admission.brown.edu"],
  ["Cornell University", "Ithaca", "NY", "private", 0.07, { ED: "Nov 1", RD: "Jan 2" }, "https://admissions.cornell.edu"],
  ["Carnegie Mellon University", "Pittsburgh", "PA", "private", 0.11, { ED: "Nov 1", RD: "Jan 3" }, "https://admission.enrollment.cmu.edu"],
  ["University of Chicago", "Chicago", "IL", "private", 0.05, { ED: "Nov 1", EA: "Nov 1", RD: "Jan 2" }, "https://collegeadmissions.uchicago.edu"],
  ["Duke University", "Durham", "NC", "private", 0.06, { ED: "Nov 1", RD: "Jan 2" }, "https://admissions.duke.edu"],
  ["Northwestern University", "Evanston", "IL", "private", 0.07, { ED: "Nov 1", RD: "Jan 2" }, "https://admissions.northwestern.edu"],
  ["Johns Hopkins University", "Baltimore", "MD", "private", 0.07, { ED: "Nov 1", RD: "Jan 2" }, "https://apply.jhu.edu"],
  ["California Institute of Technology", "Pasadena", "CA", "private", 0.03, { EA: "Nov 1", RD: "Jan 3" }, "https://www.admissions.caltech.edu"],
  ["University of California, Berkeley", "Berkeley", "CA", "public", 0.11, { RD: "Dec 2" }, "https://admissions.berkeley.edu"],
  ["University of California, Los Angeles", "Los Angeles", "CA", "public", 0.09, { RD: "Dec 2" }, "https://admission.ucla.edu"],
  ["University of California, Davis", "Davis", "CA", "public", 0.37, { RD: "Dec 2" }, "https://www.ucdavis.edu"],
  ["University of Michigan", "Ann Arbor", "MI", "public", 0.18, { EA: "Nov 1", RD: "Feb 1" }, "https://admissions.umich.edu"],
  ["Georgia Institute of Technology", "Atlanta", "GA", "public", 0.16, { EA: "Oct 15", RD: "Jan 4" }, "https://admission.gatech.edu"],
  ["University of Illinois Urbana-Champaign", "Champaign", "IL", "public", 0.45, { EA: "Nov 1", RD: "Jan 5" }, "https://admissions.illinois.edu"],
  ["University of Texas at Austin", "Austin", "TX", "public", 0.31, { RD: "Dec 1" }, "https://admissions.utexas.edu"],
  ["University of Washington", "Seattle", "WA", "public", 0.48, { RD: "Nov 15" }, "https://admit.washington.edu"],
  ["University of Wisconsin–Madison", "Madison", "WI", "public", 0.49, { EA: "Nov 1", RD: "Feb 1" }, "https://admissions.wisc.edu"],
  ["Purdue University", "West Lafayette", "IN", "public", 0.53, { EA: "Nov 1", RD: "Jan 15" }, "https://www.admissions.purdue.edu"],
  ["University of Southern California", "Los Angeles", "CA", "private", 0.10, { EA: "Nov 1", RD: "Jan 15" }, "https://admission.usc.edu"],
  ["New York University", "New York", "NY", "private", 0.08, { ED: "Nov 1", RD: "Jan 5" }, "https://www.nyu.edu/admissions"],
  ["Boston University", "Boston", "MA", "private", 0.11, { ED: "Nov 1", RD: "Jan 4" }, "https://www.bu.edu/admissions"],
  ["Arizona State University", "Tempe", "AZ", "public", 0.90, { RD: "rolling" }, "https://admission.asu.edu"],
  ["San José State University", "San Jose", "CA", "public", 0.67, { RD: "Dec 2" }, "https://www.sjsu.edu/admissions"],
  ["Pennsylvania State University", "University Park", "PA", "public", 0.55, { EA: "Nov 1", RD: "rolling" }, "https://admissions.psu.edu"],
  ["Ohio State University", "Columbus", "OH", "public", 0.53, { EA: "Nov 1", RD: "Feb 1" }, "https://undergrad.osu.edu"],
];

async function upsertCurated() {
  let inserted = 0, updated = 0;
  for (const [name, city, state, type, admit_rate, deadlines, website] of CURATED) {
    const row = { name, city, state, type, admit_rate, deadlines, website, common_app: true, country: "USA", requirements: REQ };
    const { data: existing } = await svc.from("colleges").select("id").eq("name", name).maybeSingle();
    if (existing?.id) {
      await svc.from("colleges").update(row).eq("id", existing.id);
      updated++;
    } else {
      const { error } = await svc.from("colleges").insert(row);
      if (error) { console.log("  insert failed:", name, error.message); continue; }
      inserted++;
    }
  }
  console.log(`Curated: ${inserted} inserted, ${updated} updated (of ${CURATED.length}).`);
}

async function importScorecard(key) {
  const fields = [
    "id", "school.name", "school.city", "school.state", "school.school_url",
    "latest.admissions.admission_rate.overall", "latest.student.size",
    "school.ownership",
  ].join(",");
  let imported = 0;
  for (let page = 0; page < 3; page++) {
    const u = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${key}&fields=${fields}&school.degrees_awarded.predominant=3,4&per_page=100&page=${page}&sort=latest.student.size:desc`;
    const res = await fetch(u);
    if (!res.ok) { console.log("  scorecard fetch failed:", res.status, (await res.text()).slice(0, 200)); break; }
    const json = await res.json();
    const results = json?.results ?? [];
    if (results.length === 0) break;
    const rows = results
      .filter((r) => r["school.name"])
      .map((r) => ({
        scorecard_id: String(r["id"]),
        name: r["school.name"],
        city: r["school.city"] ?? null,
        state: r["school.state"] ?? null,
        website: r["school.school_url"] ? (r["school.school_url"].startsWith("http") ? r["school.school_url"] : `https://${r["school.school_url"]}`) : null,
        admit_rate: r["latest.admissions.admission_rate.overall"] ?? null,
        size: r["latest.student.size"] ?? null,
        type: r["school.ownership"] === 1 ? "public" : r["school.ownership"] === 2 ? "private" : r["school.ownership"] === 3 ? "private" : "other",
        country: "USA",
      }));
    const { error } = await svc.from("colleges").upsert(rows, { onConflict: "scorecard_id" });
    if (error) { console.log("  upsert failed:", error.message); break; }
    imported += rows.length;
  }
  console.log(`Scorecard: imported/updated ${imported} institutions.`);
}

async function main() {
  const useScorecard = process.argv.includes("--scorecard");
  const key = process.env.SCORECARD_API_KEY;
  await upsertCurated();
  if (useScorecard) {
    if (!key) { console.log("--scorecard given but SCORECARD_API_KEY not set; skipping import. Get a free key at https://api.data.gov/signup/"); }
    else await importScorecard(key);
  } else {
    console.log("(Tip: run with --scorecard + SCORECARD_API_KEY to import the full College Scorecard dataset.)");
  }
  const { count } = await svc.from("colleges").select("id", { count: "exact", head: true });
  console.log(`Catalog now has ${count} colleges.`);
}
main().catch((e) => { console.error("seed-colleges crashed:", e?.message ?? e); process.exit(1); });
