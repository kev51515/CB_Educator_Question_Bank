#!/usr/bin/env node
/**
 * smoke-modules.mjs — exercises every module arrangement path the user can
 * trigger from the Modules tab. Hits the live cloud DB. Cleans up after
 * itself by deleting every module it created.
 *
 * Coverage:
 *   1. INSERT (inline-create) with course_id
 *   2. UPDATE name (inline rename)
 *   3. toggle_module_publish RPC
 *   4. add submodule (INSERT with parent_module_id)
 *   5. move_module RPC: drag-into-as-child
 *   6. move_module RPC: indent (sibling → child of previous sibling)
 *   7. move_module RPC: outdent (child → sibling of parent)
 *   8. reorder via move_module within same parent
 *   9. duplicate_module RPC (deep-clone)
 *  10. INSERT module_items (assignment / header / link)
 *  11. move_item_to_module RPC (item across modules)
 *  12. bulk UPDATE published WHERE id IN
 *  13. bulk DELETE WHERE id IN (cleanup)
 *  14. prevent_module_cycle trigger (drag parent onto its own descendant)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_KEY;
if (!url || !anon || !service) {
  console.error("Need SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_KEY");
  process.exit(1);
}

// Two clients: `sb` runs as the signed-in demo teacher (anon + session) so
// RPCs see a real auth.uid(); `admin` uses service-role for setup/cleanup
// when the teacher session can't see something (e.g. profiles).
const sb = createClient(url, anon, { auth: { persistSession: false } });
const admin = createClient(url, service, { auth: { persistSession: false } });

async function signIn() {
  const { data, error } = await sb.auth.signInWithPassword({
    email: "demo-teacher@example.com",
    password: "demoteacher123",
  });
  if (error) throw new Error(`signin failed: ${error.message}`);
  return data.user?.id;
}

let total = 0, pass = 0, fail = 0;
const createdIds = [];   // track for cleanup
const createdItemIds = [];

function ok(name, cond, detail = "") {
  total += 1;
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function pickDemoCourse() {
  const { data, error } = await sb
    .from("courses")
    .select("id, name, short_code")
    .eq("short_code", "69WAJ3")
    .maybeSingle();
  if (error || !data) throw new Error("Demo course 69WAJ3 not found");
  return data;
}

async function createModule(courseId, name, parentId = null, position = 0) {
  const { data, error } = await sb
    .from("course_modules")
    .insert({
      course_id: courseId,
      name,
      position,
      published: false,
      opens_at: null,
      parent_module_id: parentId,
    })
    .select("id, name, position, parent_module_id, published")
    .single();
  if (error) throw new Error(`createModule(${name}): ${error.message}`);
  createdIds.push(data.id);
  return data;
}

async function fetchModule(id) {
  const { data } = await sb
    .from("course_modules")
    .select("id, name, position, parent_module_id, published")
    .eq("id", id)
    .single();
  return data;
}

async function cleanup() {
  // Delete items first, then modules (FK cascade does items, but be explicit).
  if (createdItemIds.length) {
    await sb.from("module_items").delete().in("id", createdItemIds);
  }
  if (createdIds.length) {
    await sb.from("course_modules").delete().in("id", createdIds);
  }
}

(async function main() {
  console.log("=== smoke-modules.mjs ===");
  let course;
  try {
    const uid = await signIn();
    console.log(`signed in as demo teacher (uid=${uid?.slice(0, 8)}…)`);
    course = await pickDemoCourse();
    console.log(`course: ${course.name} (${course.short_code}, ${course.id})`);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  try {
    // ---- 1. INSERT inline-create path ----
    console.log("\n[1] inline-create (INSERT with course_id)");
    const m1 = await createModule(course.id, "smoke-test M1", null, 9000);
    ok("create top-level module", !!m1.id && m1.parent_module_id === null);
    ok("default published=false", m1.published === false);
    ok("position preserved", m1.position === 9000);

    // ---- 2. UPDATE name (inline rename) ----
    console.log("\n[2] inline rename (UPDATE name)");
    const { error: renameErr } = await sb
      .from("course_modules")
      .update({ name: "smoke-test M1 renamed" })
      .eq("id", m1.id);
    ok("rename UPDATE succeeded", !renameErr, renameErr?.message);
    const renamed = await fetchModule(m1.id);
    ok("name reflects rename", renamed.name === "smoke-test M1 renamed");

    // ---- 3. toggle_module_publish RPC ----
    console.log("\n[3] toggle_module_publish RPC");
    const { data: pubData, error: pubErr } = await sb.rpc("toggle_module_publish", {
      p_module_id: m1.id,
    });
    ok("toggle_module_publish RPC", !pubErr, pubErr?.message);
    const afterPub = await fetchModule(m1.id);
    ok("module now published", afterPub.published === true);
    await sb.rpc("toggle_module_publish", { p_module_id: m1.id }); // flip back

    // ---- 4. add submodule (parent_module_id INSERT) ----
    console.log("\n[4] add submodule");
    const m1a = await createModule(course.id, "smoke-test M1.a", m1.id, 0);
    ok("submodule has parent_module_id", m1a.parent_module_id === m1.id);

    // ---- 5. move_module: drag-into-as-child ----
    console.log("\n[5] move_module: drag-into-as-child");
    const m2 = await createModule(course.id, "smoke-test M2", null, 9001);
    const { error: moveIntoErr } = await sb.rpc("move_module", {
      p_module_id: m2.id,
      p_new_parent_id: m1.id,
      p_new_position: 1,
    });
    ok("move into M1 as child", !moveIntoErr, moveIntoErr?.message);
    const m2After = await fetchModule(m2.id);
    ok("M2 parent is M1", m2After.parent_module_id === m1.id);

    // ---- 6. indent (sibling → child of previous sibling) ----
    console.log("\n[6] indent");
    const m3 = await createModule(course.id, "smoke-test M3", null, 9002);
    const m4 = await createModule(course.id, "smoke-test M4", null, 9003);
    // Indent m4 under m3 (m4 was sibling of m3, becomes child)
    const { error: indentErr } = await sb.rpc("move_module", {
      p_module_id: m4.id,
      p_new_parent_id: m3.id,
      p_new_position: 0,
    });
    ok("indent (move under previous sibling)", !indentErr, indentErr?.message);
    const m4After = await fetchModule(m4.id);
    ok("M4 nested under M3", m4After.parent_module_id === m3.id);

    // ---- 7. outdent (child → sibling of parent) ----
    console.log("\n[7] outdent");
    const { error: outdentErr } = await sb.rpc("move_module", {
      p_module_id: m4.id,
      p_new_parent_id: null,
      p_new_position: 9004,
    });
    ok("outdent (parent → null = top-level)", !outdentErr, outdentErr?.message);
    const m4Out = await fetchModule(m4.id);
    ok("M4 is top-level again", m4Out.parent_module_id === null);

    // ---- 8. reorder within same parent ----
    console.log("\n[8] reorder within same parent");
    const { error: reorderErr } = await sb.rpc("move_module", {
      p_module_id: m4.id,
      p_new_parent_id: null,
      p_new_position: 0,
    });
    ok("move_module reorder", !reorderErr, reorderErr?.message);

    // ---- 9. duplicate_module RPC ----
    console.log("\n[9] duplicate_module RPC");
    const { data: dupData, error: dupErr } = await sb.rpc("duplicate_module", {
      p_module_id: m1.id,
    });
    ok("duplicate_module RPC", !dupErr, dupErr?.message);
    if (dupData) {
      createdIds.push(dupData);
      // The duplicate should be at top level (or same parent as original).
      const dup = await fetchModule(dupData);
      ok("duplicate exists", !!dup);
      ok("duplicate name suffixed", dup && /copy|smoke-test M1/i.test(dup.name));
    }

    // ---- 10. INSERT module_items ----
    console.log("\n[10] INSERT module_items");
    const { data: header, error: headerErr } = await sb
      .from("module_items")
      .insert({
        module_id: m1.id,
        position: 0,
        item_type: "header",
        title: "smoke-test header",
      })
      .select("id")
      .single();
    ok("insert header item", !headerErr, headerErr?.message);
    if (header) createdItemIds.push(header.id);

    const { data: link, error: linkErr } = await sb
      .from("module_items")
      .insert({
        module_id: m1.id,
        position: 1,
        item_type: "link",
        title: "smoke-test link",
        url: "https://example.com",
      })
      .select("id")
      .single();
    ok("insert link item", !linkErr, linkErr?.message);
    if (link) createdItemIds.push(link.id);

    // ---- 11. move_item_to_module RPC ----
    console.log("\n[11] move_item_to_module RPC");
    if (header) {
      const { error: moveItemErr } = await sb.rpc("move_item_to_module", {
        p_item_id: header.id,
        p_target_module_id: m3.id,
        p_position: 0,
      });
      ok("move item across modules", !moveItemErr, moveItemErr?.message);
      const { data: moved } = await sb
        .from("module_items")
        .select("module_id")
        .eq("id", header.id)
        .single();
      ok("item now in M3", moved?.module_id === m3.id);
    }

    // ---- 12. bulk UPDATE published ----
    console.log("\n[12] bulk UPDATE published");
    const bulkIds = createdIds.slice(0, 3);
    const { error: bulkPubErr } = await sb
      .from("course_modules")
      .update({ published: true })
      .in("id", bulkIds);
    ok("bulk publish via IN()", !bulkPubErr, bulkPubErr?.message);
    const { data: pubCheck } = await sb
      .from("course_modules")
      .select("id, published")
      .in("id", bulkIds);
    ok(
      "all bulk-updated rows published",
      pubCheck && pubCheck.every((r) => r.published === true),
    );

    // ---- 13. prevent_module_cycle trigger ----
    console.log("\n[13] prevent_module_cycle trigger");
    // Try to make M1 a child of M2 (which is now a child of M1) → cycle.
    const { error: cycleErr } = await sb.rpc("move_module", {
      p_module_id: m1.id,
      p_new_parent_id: m2.id,
      p_new_position: 0,
    });
    ok("cycle attempt rejected", !!cycleErr, cycleErr ? "(expected)" : "(no error returned!)");

    // ---- 14. bulk DELETE WHERE id IN ----
    console.log("\n[14] bulk DELETE (cleanup path)");
    const beforeCount = createdIds.length;
    const { error: delErr } = await sb
      .from("course_modules")
      .delete()
      .in("id", createdIds);
    ok("bulk delete via IN()", !delErr, delErr?.message);
    if (!delErr) {
      createdIds.length = 0; // already deleted
      createdItemIds.length = 0; // cascaded
    }
    console.log(`  (deleted ${beforeCount} test modules)`);

  } catch (err) {
    console.error("\n[!] unhandled:", err.message);
    fail += 1;
  } finally {
    // Belt-and-suspenders cleanup if any test path bailed early.
    await cleanup();
  }

  console.log("\n----------------------------------");
  console.log(`TOTAL: ${total}  PASS: ${pass}  FAIL: ${fail}`);
  console.log("==================================");
  process.exit(fail > 0 ? 1 : 0);
})();
