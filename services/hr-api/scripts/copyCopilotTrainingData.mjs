import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { backendPaths } from './repositoryPaths.mjs'

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { copilotSource: source, copilotDestination: destination, migrationsSource, migrationsDestination } = backendPaths(serverRoot)

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ copilotSource: source, copilotDestination: destination, migrationsSource, migrationsDestination }))
} else {
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)

  // Keep SQL/metadata beside the emitted package for its migration runner.
  rmSync(migrationsDestination, { recursive: true, force: true })
  cpSync(migrationsSource, migrationsDestination, { recursive: true })
}
