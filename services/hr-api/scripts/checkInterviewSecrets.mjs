import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Known synthetic canaries are supplied only to the isolated production web build.
export function secretIndicators(text) {
  return [/phase55-synthetic-bundle-canary-(?:openai|anthropic)-not-a-key/g,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g,
    /postgres(?:ql)?:\/\/[^\s'"<>]+/g,
    /VITE_(?:SESSION_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|DATABASE_URL|PROVIDER_TOKEN)/g]
    .reduce((sum, pattern) => sum + (text.match(pattern) || []).length, 0)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), files = []
  const walk = path => {for (const name of readdirSync(path)) {const item = resolve(path, name); if (statSync(item).isDirectory()) walk(item); else if (/\.(?:js|css|html|ts|tsx|map)$/.test(name)) files.push(item)}}
  walk(resolve(root, 'apps/hr-web/src')); walk(resolve(root, 'apps/hr-web/dist'))
  const matches = files.map(path => ({path: relative(root, path).replaceAll('\\', '/'), matches: secretIndicators(readFileSync(path, 'utf8'))})).filter(row => row.matches)
  const result = {status: matches.length ? 'FAIL' : 'PASS', checkedFiles: files.length, offendingFiles: matches, secretValuesPrinted: 0, scope: 'Frontend source and emitted production HTML/JS/CSS/maps; server-only canary/key/private-key/database-URL indicators'}
  if (process.env.PHASE55_OUTPUT) writeFileSync(resolve(process.env.PHASE55_OUTPUT, 'secret-scan.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(`${result.status} frontend/bundle secret exclusion; files=${files.length}; offendingFiles=${matches.length}; valuesPrinted=0`)
  if (matches.length) process.exitCode = 1
}
