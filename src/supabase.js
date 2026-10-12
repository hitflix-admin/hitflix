import { createClient } from "@supabase/supabase-js";

// Both values are safe to ship in the client bundle — the anon key only grants
// what the row-level security policies in supabase/migrations allow. Never put
// the service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null when the env vars aren't set (e.g. a fresh checkout without .env.local),
// so the site still runs fully signed-out on localStorage instead of crashing.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

// Google sign-in needs its own OAuth setup in Google Cloud + the Supabase
// dashboard, so the button stays hidden until that's done.
export const googleAuthEnabled = import.meta.env.VITE_SUPABASE_GOOGLE === "1";
