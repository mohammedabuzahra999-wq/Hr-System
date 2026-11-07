import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'

/** Locate maintained workspace markers without reading environment/runtime files. */
export function findRepositoryRoot(start) {
  let directory = resolve(start)
  for (;;) {
    if (existsSync(join(directory, 'package.json'))
      && existsSync(join(directory, 'packages', 'contracts', 'package.json'))
      && existsSync(join(directory, 'apps', 'hr-web', 'package.json'))) return directory
    const parent = dirname(directory)
    if (parent === directory) throw new Error('Cannot locate the HR workspace root')
    directory = parent
  }
}

/** Pure layout calculation; supports the current package and its approved destination. */
export function backendPaths(backendRoot, repositoryRoot = findRepositoryRoot(backendRoot)) {
  const repository = resolve(repositoryRoot)
  const backend = resolve(backendRoot)
  const packagePath = relative(repository, backend)
  if (packagePath !== 'server' && packagePath !== join('services', 'hr-api')) {
    throw new Error('Backend must be server or services/hr-api inside the workspace')
  }
  const legacy = join(repository, 'server')
  const compiledPackage = join(backend, 'dist', packagePath)
  return Object.freeze({
    repositoryRoot: repository,
    backendRoot: backend,
    packagePath,
    compilerRoot: repository,
    compiledPackage,
    compiledEntry: join(compiledPackage, 'src', 'index.js'),
    compiledContracts: join(backend, 'dist', 'packages', 'contracts', 'src'),
    copilotSource: join(backend, 'src', 'copilot', 'data', 'hr_agent_intents_10000.jsonl'),
    copilotDestination: join(compiledPackage, 'src', 'copilot', 'data', 'hr_agent_intents_10000.jsonl'),
    migrationsSource: join(backend, 'drizzle'),
    migrationsDestination: join(compiledPackage, 'drizzle'),
    environmentFile: join(legacy, '.env'),
    retainedServer: legacy,
    uploadsRoot: join(legacy, 'uploads'),
    workerScript: join(legacy, 'local-voice', 'worker.py'),
    localVoiceRoot: join(repository, '.local-voice'),
    workerToken: join(repository, '.local-voice', 'worker.token'),
  })
}

/**
 * Opt-in runtime initialization, never called on import. Phase 2D-1 tests inject
 * a synthetic environment and loader; they must not load the real server/.env.
 */
export function prepareRetainedRuntime({
  backendRoot,
  repositoryRoot,
  env = process.env,
  workingDirectory = process.cwd(),
  loadEnvironment = loadDotenv,
}) {
  const paths = backendPaths(backendRoot, repositoryRoot)
  const environmentFile = env.DOTENV_CONFIG_PATH
    ? resolve(workingDirectory, env.DOTENV_CONFIG_PATH)
    : paths.environmentFile
  const result = loadEnvironment({
    path: environmentFile,
    processEnv: env,
    // Match the installed dotenv/config environment-option behavior.
    override: Boolean(env.DOTENV_CONFIG_OVERRIDE),
    quiet: true,
    debug: false,
    encoding: env.DOTENV_CONFIG_ENCODING ?? 'utf8',
  })
  // A deployment may supply its entire environment without a local file.
  if (result?.error && result.error.code !== 'ENOENT') {
    throw new Error('Cannot load the configured environment file')
  }
  // Later dotenv/config imports must select the same file, not a new cwd/.env.
  env.DOTENV_CONFIG_PATH = environmentFile
  env.UPLOAD_DIR = resolve(paths.retainedServer, env.UPLOAD_DIR ?? './uploads')
}
