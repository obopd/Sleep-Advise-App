// Cloud configuration. Both values are public by design: the database only lets each
// signed-in user reach their own rows (Row Level Security, supabase/migrations).
// Never put a service-role key here.
//
// Leave empty to run fully on the device (local-only mode, no account needed).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
