// Offline compatibility harness for these two Deno.test files when Deno is absent.
// Node 22: node --experimental-strip-types scripts/test-hu18-helpers.mjs <test.ts> ...
import { pathToFileURL } from 'node:url';
const cases=[];
globalThis.Deno={test:(name,run)=>cases.push({name,run})};
for (const path of process.argv.slice(2)) await import(pathToFileURL(path));
let failed=0;
for (const test of cases) {
 try { await test.run(); } catch (error) { failed++; console.error(test.name, error.message); }
}
console.log(`${cases.length-failed} passed, ${failed} failed`);
process.exitCode=failed ? 1 : 0;
