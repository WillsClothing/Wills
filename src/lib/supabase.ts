import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True once the Supabase keys are set. Without them the shop runs in demo mode. */
export const isConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'));

export const supabase: SupabaseClient | null = isConfigured ? createClient(url!, anonKey!) : null;

export const IMAGE_BUCKET = 'product-images';
