/**
 * Calling this server's own API from inside it.
 *
 * The assistant needs to do things a person can do — submit leave, approve a
 * request, publish a vacancy. Every one of those already exists as a route,
 * and every route carries more than the write: validation, the role check, the
 * balance it consumes, the attendance days it marks, the notification it sends,
 * the realtime event it publishes. Re-implementing any of that inside the
 * assistant would produce a second version that drifts from the first, and the
 * one that drifts is always the one nobody is looking at.
 *
 * So the assistant is a client of this API rather than a second implementation
 * of it. It builds a real request against the real route, carrying the asker's
 * own session, and the route runs exactly as it does for the browser — same
 * permissions, same refusals, same side effects.
 *
 * The permission consequence is worth stating plainly: the assistant's own
 * action registry is checked first so the refusal is a sentence rather than a
 * status code, but it is not what enforces anything. The route enforces it. An
 * action wrongly listed as permitted in `copilot/actions.ts` would still come
 * back 403, because `requireRole` runs on the way in either way.
 *
 * Registered at boot rather than imported, because `index.ts` already imports
 * the copilot routes and importing it back would be a cycle.
 */

type Fetcher = (request: Request) => Promise<Response> | Response

let fetcher: Fetcher | null = null

export function registerInternalApi(f: Fetcher): void {
  fetcher = f
}

export interface InternalCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Path under `/api`, e.g. `/requests/leave`. */
  path: string
  body?: unknown
  /** Server-originated metadata, used for audit attribution only. */
  headers?: Record<string, string>
  /**
   * The asker's own cookie header, forwarded unchanged.
   *
   * Not a service account, and deliberately so. The call is made as the person
   * who asked, so it can do exactly what they could do by hand and no more —
   * an assistant with wider access than its user is a hole shaped like a
   * convenience.
   */
  cookie: string
}

export interface InternalResult {
  status: number
  ok: boolean
  /** The parsed body, or null when there was none. */
  data: unknown
  /** The server's own error code, when it failed. */
  error: string | null
  /**
   * Coarse server processing time from an in-process route, when it supplied
   * one.  This is operational metadata only; it never changes the result or
   * the permission path.
   */
  serverTiming: string | null
}

/**
 * Where the request goes when nothing registered a handler.
 *
 * Inside the API process, `index.ts` registers the app and a call never leaves
 * memory. The MCP server is a different process: it imports the same action
 * code but there is no app in it, so the same call has to travel over the
 * network to the real server.
 *
 * Deliberately the same function either way. The alternative — a second path
 * for out-of-process callers — is a second set of decisions about headers,
 * cookies and error shapes, and the one that gets exercised less is the one
 * that quietly stops matching.
 */
const REMOTE = process.env.HR_API_URL ?? 'http://localhost:8787/api'

export async function callInternal(call: InternalCall): Promise<InternalResult> {
  const headers: Record<string, string> = { cookie: call.cookie, ...call.headers }
  if (call.body !== undefined) headers['content-type'] = 'application/json'

  const request = new Request(`${fetcher ? 'http://internal/api' : REMOTE}${call.path}`, {
    method: call.method,
    headers,
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
  })

  const response = await (fetcher ? fetcher(request) : fetch(request))

  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  const error =
    response.ok || typeof data !== 'object' || data === null
      ? null
      : ((data as { error?: string; message?: string }).error ??
        (data as { message?: string }).message ??
        null)

  return {
    status: response.status,
    ok: response.ok,
    data,
    error,
    serverTiming: response.headers.get('server-timing'),
  }
}
