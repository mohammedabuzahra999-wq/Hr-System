import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { prepareRetainedRuntime } from './repositoryPaths.mjs'

// Runtime commands opt in with --import. Never import this module in structural
// validation: it is the only compatibility module that loads the real dotenv.
const require = createRequire(import.meta.url)
const explicitPath = [...process.argv].reverse().find(arg => /^dotenv_config_path=.+/.test(arg))
if (explicitPath) process.env.DOTENV_CONFIG_PATH = explicitPath.slice('dotenv_config_path='.length)

prepareRetainedRuntime({
  backendRoot: fileURLToPath(new URL('../', import.meta.url)),
  loadEnvironment(options) {
    process.env.DOTENV_CONFIG_PATH = options.path
    process.env.DOTENV_CONFIG_QUIET = 'true'
    process.env.DOTENV_CONFIG_DEBUG = 'false'
    // Cache the original entry point before anchoring uploads. Later source
    // imports reuse it, so an explicit override cannot reload relative paths.
    require('dotenv/config')
    return {}
  },
})
