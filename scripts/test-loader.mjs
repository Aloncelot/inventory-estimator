// scripts/test-loader.mjs
// Lets `node --test` run the app's domain code as-is: resolves extensionless
// imports (../calculators → ../calculators/index.js) and treats src/ files as ES modules.
// Usage: npm test
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const isFile = (u) => { try { return statSync(fileURLToPath(u)).isFile(); } catch { return false; } };
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL?.startsWith('file:')) {
    const base = new URL(specifier, context.parentURL);
    if (!isFile(base)) {
      for (const ext of ['.js', '.mjs', '/index.js']) {
        const cand = new URL(base.href + ext);
        if (isFile(cand)) return { url: cand.href, shortCircuit: true, format: 'module' };
      }
    }
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith('file:') && /\\/src\\/.*\\.js$/.test(url)) {
    return next(url, { ...context, format: 'module' });
  }
  return next(url, context);
}
`));
