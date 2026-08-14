import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não definidas. Veja .env.example.",
  );
}

// Client server-side (service role) usado para validar o JWT do usuário
// nas rotas do painel admin (seção 6 do PRD). Endpoints ainda não implementados.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
