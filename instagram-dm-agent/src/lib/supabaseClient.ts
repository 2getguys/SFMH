import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/env';

if (!SUPABASE_URL) {
  throw new Error('Supabase URL is not defined in environment variables.');
}

if (!SUPABASE_ANON_KEY) {
  throw new Error('Supabase anon key is not defined in environment variables.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 