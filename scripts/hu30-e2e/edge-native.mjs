// Native Supabase Edge Runtime adapter; only outgoing mail is captured locally.
const mail = Deno.env.get('HU30_TEST_MAIL_URL');
const networkFetch = globalThis.fetch;
globalThis.fetch = (url, init) => String(url) === 'https://api.resend.com/emails'
  ? networkFetch(mail + '/capture', init) : networkFetch(url, init);
export function serve(handler) { Deno.serve(handler); }
