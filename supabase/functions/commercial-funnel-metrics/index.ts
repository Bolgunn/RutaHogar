import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { protectParticipationRequest } from "../co-debtor-consent/security.ts";
import { metricsResponse } from "./handler.ts";

serve(req => protectParticipationRequest(req, async req => {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error();
    return await metricsResponse(req, createClient(url, key, { auth: { persistSession: false } }));
  } catch {
    return new Response(JSON.stringify({ code: "metrics_unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}, Deno.env.get("APP_PUBLIC_URL") || "", Deno.env.get("CO_DEBTOR_ALLOWED_ORIGINS") || ""));
