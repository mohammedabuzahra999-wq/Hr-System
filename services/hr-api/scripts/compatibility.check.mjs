import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, populate } from 'dotenv'
import ts from 'typescript'
import { backendPaths, findRepositoryRoot, prepareRetainedRuntime } from './repositoryPaths.mjs'

const backend = fileURLToPath(new URL('../', import.meta.url))
const repository = findRepositoryRoot(backend)
const current = backendPaths(backend)
const legacy = backendPaths(join(repository, 'server'), repository)
const futureRoot = join(repository, 'services', 'hr-api')
const future = backendPaths(futureRoot, repository)

assert.equal(legacy.compiledEntry, join(repository, 'server', 'dist', 'server', 'src', 'index.js'))
assert.equal(future.compiledEntry, join(futureRoot, 'dist', 'services', 'hr-api', 'src', 'index.js'))
assert.equal(current.compiledEntry, future.compiledEntry)
for (const paths of [legacy, current]) {
  assert.equal(paths.workerScript, join(repository, 'server', 'local-voice', 'worker.py'))
  assert.equal(paths.localVoiceRoot, join(repository, '.local-voice'))
  assert.equal(paths.workerToken, join(repository, '.local-voice', 'worker.token'))
  assert.equal(paths.environmentFile, join(repository, 'server', '.env'))
  assert.equal(paths.uploadsRoot, join(repository, 'server', 'uploads'))
  const runner = join(paths.compiledPackage, 'src', 'db', 'migrate.js')
  assert.equal(resolve(dirname(runner), '../../drizzle'), paths.migrationsDestination)
  assert.equal(paths.copilotDestination, join(paths.compiledPackage, 'src', 'copilot', 'data', 'hr_agent_intents_10000.jsonl'))
}
assert.throws(() => backendPaths(join(repository, '..', 'outside'), repository))
assert.ok(existsSync(current.workerScript))
assert.ok(existsSync(current.migrationsSource))
assert.ok(existsSync(current.copilotSource))
console.log('PASS current/future layout, retained worker/runtime, JSONL and migration-runner paths')

// Verify the proposed compiler options with filename calculation only: no emit,
// no model imports, no application initialization, and no future directories.
const config = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'))
const converted = ts.convertCompilerOptionsFromJson({ ...config.compilerOptions, rootDir: '../..' }, ts.normalizePath(futureRoot))
assert.equal(converted.errors.length, 0)
const entry = ts.normalizePath(join(futureRoot, 'src', 'index.ts'))
const contracts = ts.normalizePath(join(repository, 'packages', 'contracts', 'src', 'index.ts'))
const command = { options: { ...converted.options, configFilePath: ts.normalizePath(join(futureRoot, 'tsconfig.json')) }, fileNames: [entry, contracts], errors: [] }
assert.ok(ts.getOutputFileNames(command, entry, !ts.sys.useCaseSensitiveFileNames).map(file => resolve(file)).includes(future.compiledEntry))
assert.ok(ts.getOutputFileNames(command, contracts, !ts.sys.useCaseSensitiveFileNames).map(file => resolve(file)).includes(join(future.compiledContracts, 'index.js')))
console.log('PASS proposed dist/services/hr-api and compiled contracts layout (no emit)')

for (const root of [legacy.backendRoot, futureRoot]) {
  const env = { INHERITED: 'synthetic-parent' }
  let calls = 0
  prepareRetainedRuntime({ backendRoot: root, repositoryRoot: repository, env, loadEnvironment: options => {
    calls++
    assert.equal(options.path, current.environmentFile)
    assert.equal(options.processEnv, env)
    assert.equal(options.quiet, true)
    assert.equal(options.debug, false)
    assert.equal(options.override, false)
    populate(options.processEnv, parse('INHERITED=synthetic-file\nUPLOAD_DIR=relative-uploads'), { override: options.override })
    return {}
  } })
  assert.equal(calls, 1)
  assert.equal(env.INHERITED, 'synthetic-parent')
  assert.equal(env.DOTENV_CONFIG_PATH, current.environmentFile)
  assert.equal(env.UPLOAD_DIR, join(repository, 'server', 'relative-uploads'))
}
for (const value of [undefined, '', 'relative-uploads', join(repository, 'synthetic-absolute-uploads')]) {
  const env = value === undefined ? {} : { UPLOAD_DIR: value }
  prepareRetainedRuntime({ backendRoot: futureRoot, repositoryRoot: repository, env, loadEnvironment: () => ({ error: { code: 'ENOENT' } }) })
  assert.equal(env.UPLOAD_DIR, resolve(current.retainedServer, value ?? './uploads'))
}
const custom = { DOTENV_CONFIG_PATH: 'synthetic.env', DOTENV_CONFIG_ENCODING: 'utf8' }
prepareRetainedRuntime({ backendRoot: futureRoot, repositoryRoot: repository, workingDirectory: repository, env: custom, loadEnvironment: options => {
  assert.equal(options.path, join(repository, 'synthetic.env'))
  return {}
} })
assert.throws(() => prepareRetainedRuntime({ backendRoot: futureRoot, repositoryRoot: repository, env: {}, loadEnvironment: () => ({ error: { code: 'EACCES' } }) }), /Cannot load the configured environment file/)
for (const override of ['', 'true', 'false']) {
  const env = { INHERITED: 'synthetic-parent', DOTENV_CONFIG_OVERRIDE: override }
  prepareRetainedRuntime({ backendRoot: futureRoot, repositoryRoot: repository, env, loadEnvironment: options => {
    assert.equal(options.override, Boolean(override))
    populate(options.processEnv, { INHERITED: 'synthetic-file' }, { override: options.override })
    return {}
  } })
  assert.equal(env.INHERITED, override ? 'synthetic-file' : 'synthetic-parent')
}
console.log('PASS synthetic environment precedence, explicit file override, missing-file handling and retained relative/absolute uploads; no env files read')

const dryRun = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./copyCopilotTrainingData.mjs', import.meta.url)), '--dry-run'], { encoding: 'utf8' }))
assert.equal(dryRun.copilotDestination, current.copilotDestination)
assert.equal(dryRun.migrationsDestination, current.migrationsDestination)
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(pkg.name, '@hr/server')
assert.equal(pkg.main, 'dist/services/hr-api/src/index.js')
for (const name of ['dev', 'start', 'mcp', 'db:generate', 'db:migrate', 'db:seed', 'db:seed:payroll', 'db:seed:jd', 'db:embed', 'db:cv:import', 'db:migrate:payroll-auditor']) {
  assert.ok(pkg.scripts[name].includes('--import ./scripts/runtimePreload.mjs'), name)
}
for (const name of ['check', 'build', 'check:permissions', 'check:gate', 'check:payroll', 'check:payroll-audit', 'check:voice', 'check:plans']) {
  assert.ok(!pkg.scripts[name].includes('runtimePreload'), name)
}
console.log('PASS asset-copy dry run and runtime-only preload wiring; no copies, migrations, server startup or real environment initialization')
