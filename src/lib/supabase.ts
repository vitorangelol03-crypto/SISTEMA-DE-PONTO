import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ezfpijdjvarbrwhiutek.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6ZnBpamRqdmFyYnJ3aGl1dGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MDc3NzAsImV4cCI6MjA3NDM4Mzc3MH0.r4Gz3yvPWxlH1Q0QWvtvmYKCxuxYML1kMMDg5S_h5uE';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Erro crítico: Credenciais do Supabase não configuradas');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: window.localStorage
  }
});