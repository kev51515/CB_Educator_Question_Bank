/**
 * Cleanup of clickthrough/edge-harness test data on prod. --apply to delete.
 * TARGETS (timestamp-suffixed harness identities only):
 *   courses: teacher email ^(t-clk-|e-)<digits>@gmail.com
 *   users:   ^(t-clk-|s-clk-|e-|s-e-|na-|mvt-|e2e-seat-teacher-)<digits>@(gmail|example).com
 * KEEPS: all real users; @students.local managed students; the pickleball
 * demo seed (pb-player-N, pb-coach-N, name.demo at example.com) which powers
 * the owner's Pickleball Demo courses.
 */
import { createClient } from "@supabase/supabase-js";
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");

const HARNESS_RE = /^(t-clk-|s-clk-|e-|s-e-|na-|mvt-|e2e-seat-teacher-)\d+@(gmail|example)\.com$/i;

// all users, classified
const all = [];
let page = 1;
for (;;) {
  const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error.message); process.exit(1); }
  all.push(...data.users);
  if (data.users.length < 200) break;
  page++;
}
const harnessUsers = all.filter((u) => HARNESS_RE.test(u.email ?? ""));
const unmatched = all.filter((u) => !HARNESS_RE.test(u.email ?? "") &&
  /\d{10,}@/.test(u.email ?? ""));  // timestamp-style but unknown prefix — surface, don't delete
console.log(`users total=${all.length}; harness matches=${harnessUsers.length}`);
for (const u of harnessUsers) console.log("  DEL user:", u.email);
if (unmatched.length) {
  console.log("UNMATCHED timestamp-style (left alone — review):");
  for (const u of unmatched) console.log("  ??", u.email);
}

// harness-owned courses
const { data: courses } = await service
  .from("courses")
  .select("id, name, short_code, teacher:profiles!courses_teacher_id_fkey(email)");
const harnessIds = new Set(harnessUsers.map((u) => u.id));
const delCourses = (courses ?? []).filter((c) => /^(t-clk-|e-)\d+@gmail\.com$/i.test(c.teacher?.email ?? ""));
console.log(`courses to delete: ${delCourses.length}`);
for (const c of delCourses) console.log(`  DEL course: ${c.short_code}  ${c.name}  (${c.teacher?.email})`);

if (!APPLY) { console.log("\nDRY RUN — rerun with --apply."); process.exit(0); }

let cDel = 0, uDel = 0, fails = 0;
if (delCourses.length) {
  const { error } = await service.from("courses").delete().in("id", delCourses.map((c) => c.id));
  if (error) { console.error("course delete:", error.message); fails++; } else cDel = delCourses.length;
}
for (const u of harnessUsers) {
  const { error } = await service.auth.admin.deleteUser(u.id);
  if (error) { console.error("user delete", u.email, error.message); fails++; } else uDel++;
}
console.log(`\nDELETED: ${cDel} courses, ${uDel} users, ${fails} failures`);
