import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load Supabase environment variables
const initialUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kyvfjiwihwmorddsrbvd.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Q6xbXEplacGjhDbAeZJ5Mw_LoCtnzp1';

let activeUrl = initialUrl;
let currentClient: SupabaseClient | null = initialUrl && supabaseAnonKey 
  ? createClient(initialUrl, supabaseAnonKey)
  : null;

export function switchToProxy() {
  if (supabaseAnonKey) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const proxyUrl = origin + "/supabase-proxy";
    console.log("Switching Supabase URL dynamically to proxy:", proxyUrl);
    activeUrl = proxyUrl;
    currentClient = createClient(proxyUrl, supabaseAnonKey);
  }
}

export function switchToDirect() {
  if (supabaseAnonKey && initialUrl) {
    console.log("Switching Supabase URL dynamically back to direct:", initialUrl);
    activeUrl = initialUrl;
    currentClient = createClient(initialUrl, supabaseAnonKey);
  }
}

export function isProxyActive(): boolean {
  return activeUrl.includes('/supabase-proxy');
}

export function isSupabaseConfigured(): boolean {
  return !!currentClient;
}

// Export a proxy so that any file importing `supabase` directly will always use the active client instance
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop, receiver) {
    if (!currentClient) return undefined;
    const val = Reflect.get(currentClient, prop);
    if (typeof val === 'function') {
      return val.bind(currentClient);
    }
    return val;
  }
});

console.log('Supabase initialization status:', isSupabaseConfigured() ? 'CONFIGURED' : 'NOT CONFIGURED');
