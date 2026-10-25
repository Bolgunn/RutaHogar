import { protectParticipationRequest } from "./security.ts";
function check(value: unknown, message: string) { if (!value) throw new Error(message); }
Deno.test("HU30 private origin wrapper protects success and error responses", async () => {
  for (const status of [200, 401, 403, 409, 422, 503]) {
    const response = await protectParticipationRequest(new Request("http://edge.test", {method:"POST",headers:{Origin:"https://app.test"}}),
      async () => new Response("{}", {status,headers:{"Access-Control-Allow-Origin":"*"}}), "https://app.test");
    check(response.status === status, "status changed");
    check(response.headers.get("Cache-Control") === "private, no-store", "private cache missing");
    check(response.headers.get("Access-Control-Allow-Origin") === "https://app.test", "origin not exact");
    check(response.headers.get("Vary") === "Origin", "vary missing");
  }
});
Deno.test("HU30 rejects external, null and lookalike origins before dispatch", async () => {
  for (const origin of ["https://app.test.evil", "https://evil.test", "null"]) {
    let called = false;
    const response = await protectParticipationRequest(new Request("http://edge.test",{method:"POST",headers:{Origin:origin}}),async()=>{called=true;return new Response();},"https://app.test");
    check(response.status === 403 && !called, "untrusted origin dispatched");
    check(!response.headers.has("Access-Control-Allow-Origin"), "origin reflected");
    check(response.headers.get("Cache-Control") === "private, no-store", "denial cached");
  }
});
Deno.test("HU30 allows configured preflight and server/cron without Origin", async () => {
 const preflight = await protectParticipationRequest(new Request("http://edge.test",{method:"OPTIONS",headers:{Origin:"http://localhost:5173"}}),async()=>{throw new Error("preflight dispatched")},"https://app.test","http://localhost:5173");
 check(preflight.status === 204 && preflight.headers.get("Access-Control-Allow-Origin") === "http://localhost:5173", "preflight failed");
 const cron = await protectParticipationRequest(new Request("http://edge.test",{method:"POST"}),async()=>new Response("ok"),"https://app.test");
 check(cron.status === 200 && !cron.headers.has("Access-Control-Allow-Origin"),"server request failed");
});
Deno.test("HU30 fails closed on invalid public URL or allowed-origin configuration", async () => {
 for (const [base, extra] of [["javascript:alert(1)",""],["https://app.test","*"],["https://app.test","https://evil.test/path"]]) {
  const response = await protectParticipationRequest(new Request("http://edge.test"),async()=>{throw new Error("bad config dispatched")},base,extra);
  check(response.status === 503 && response.headers.get("Cache-Control") === "private, no-store","configuration leaked/fail open");
 }
});
