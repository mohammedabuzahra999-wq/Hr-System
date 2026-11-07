import 'dotenv/config'
import { startMcpServer } from './server.js'

/**
 * The entry point, kept separate from the server itself so the server can be
 * imported and tested without a process starting and a transport attaching.
 *
 * Failures are fatal and loud. An MCP server that starts without a session
 * would answer every tool call with a refusal, and a calling agent reading
 * those refusals would conclude the person has no permissions rather than that
 * nobody signed in.
 */
startMcpServer().catch((error) => {
  console.error('[mcp] could not start:', error instanceof Error ? error.message : error)
  process.exit(1)
})
