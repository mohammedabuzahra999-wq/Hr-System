import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const slash = value => value.replaceAll('\\', '/')
function walk(path, exclude = () => false) {
  if (!existsSync(path) || exclude(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).sort().flatMap(name => walk(resolve(path, name), exclude))
}
export function manifest(kind = 'source') {
  const sourceDirs = ['services/hr-api/src', 'services/hr-api/scripts', 'services/hr-api/drizzle', 'packages/contracts/src', 'apps/hr-web/src', 'apps/hr-web/public']
  const configFiles = ['package.json', 'package-lock.json', '.gitignore', 'README.md', 'render.yaml',
    'services/hr-api/package.json', 'services/hr-api/tsconfig.json', 'services/hr-api/drizzle.config.ts',
    'packages/contracts/package.json', 'packages/contracts/tsconfig.json', 'packages/contracts/tsconfig.build.json',
    'apps/hr-web/package.json', 'apps/hr-web/package-lock.json', 'apps/hr-web/index.html', 'apps/hr-web/vite.config.ts',
    'apps/hr-web/tsconfig.json', 'apps/hr-web/tsconfig.app.json', 'apps/hr-web/tsconfig.node.json']
  const protectedDirs = ['docs/ai-interviewer', 'docs/fine-tuning', '.local-dev/ai-interviewer-phase3', '.local-dev/ai-interviewer-phase4']
  const paths = kind === 'protected'
    ? protectedDirs.flatMap(p => walk(resolve(root, p), p => /[\\/](?:phase-5\.1-baseline|phase-5\.2|phase-5\.3|phase-5\.4|phase-5\.5)(?:[\\/]|$)|[\\/]chrome-[^\\/]+/.test(p)))
    : [...sourceDirs.flatMap(p => walk(resolve(root, p))), ...configFiles.map(p => resolve(root, p)).filter(existsSync)]
  const files = [...new Set(paths)].map(path => ({ path: slash(relative(root, path)), bytes: statSync(path).size, sha256: sha256(readFileSync(path)) }))
    .sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return { format: 'phase55-sha256-manifest-v1', algorithm: 'SHA-256', kind, fileCount: files.length,
    filesDigest: sha256(Buffer.from(JSON.stringify(files))), files }
}
export function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n') }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, output] = process.argv.slice(2)
  if (!['source', 'protected'].includes(kind) || !output) throw Error('Usage: node manifest.mjs source|protected OUTPUT.json')
  const value = manifest(kind); writeJson(resolve(output), value)
  console.log(`${kind}: files=${value.fileCount}; filesDigest=${value.filesDigest}; manifestSHA256=${sha256(readFileSync(output))}`)
}
