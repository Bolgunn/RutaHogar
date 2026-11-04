// Node transport for the unchanged production Edge handler. No fake Auth/RPC responses.
import http from 'node:http';
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(process.env.HU30_E2E_CONFIG, 'utf8'));
globalThis.Deno = { env: { get: key => process.env[key] } };
const networkFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (String(url) === 'https://api.resend.com/emails') return networkFetch(config.mail + '/capture', init);
  return networkFetch(url, init);
};
export function serve(handler) {
  http.createServer(async (incoming, outgoing) => {
    try {
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const request = new Request('http://127.0.0.1:' + config.edge_port + incoming.url, {
        method: incoming.method, headers: incoming.headers,
        ...(!['GET', 'HEAD'].includes(incoming.method) ? { body } : {}),
      });
      const response = await handler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end('Test transport failed'); }
  }).listen(config.edge_port, '127.0.0.1');
}
