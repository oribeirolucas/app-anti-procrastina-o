import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não definidas. Veja .env.example.",
  );
}

// Usado pelo painel admin (seção 6 do PRD) para login. O diagnóstico do
// usuário final não exige autenticação no MVP.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
