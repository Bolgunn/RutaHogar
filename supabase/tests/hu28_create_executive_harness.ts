// Sirve create-executive sin Edge Runtime y sin Resend, para hu28_team_stack.mjs:
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=fake \
//     deno run -A supabase/tests/hu28_create_executive_harness.ts
//
// Sólo intercepta la llamada a Resend: un destinatario con "falla" recibe un rechazo.
const realFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("https://api.resend.com/")) return realFetch(input, init);
  const body = JSON.parse(String(init?.body));
  console.log(`resend from=${body.from} to=${body.to} subject=${body.subject}`);
  if (Deno.env.get("HARNESS_EMAIL_OUT")) {
    await Deno.writeTextFile(Deno.env.get("HARNESS_EMAIL_OUT")!, body.html);
  }
  return String(body.to).includes("falla")
    ? new Response(JSON.stringify({ message: "rechazado" }), { status: 422 })
    : new Response(JSON.stringify({ id: "fake" }), { status: 200 });
};

await import("../functions/create-executive/index.ts");
