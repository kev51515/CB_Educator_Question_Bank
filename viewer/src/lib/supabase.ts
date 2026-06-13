/**
 * Supabase client singleton.
 *
 * Reads URL and anon key from Vite env vars (VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY). Throws at import time if either is missing so we
 * fail fast rather than blowing up later with a confusing "undefined" error
 * from inside supabase-js.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
      "in viewer/.env.local (see .env.local.example).",
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Exposed for the few places that need to hit the Storage REST endpoint
// directly (e.g. an XHR upload with progress events — supabase-js's
// fetch-based .upload() can't report upload progress).
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
