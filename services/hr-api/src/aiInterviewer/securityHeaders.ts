import type { MiddlewareHandler } from 'hono'

export const isInterviewPath = (path: string) => path.startsWith('/api/ai-interview') || path === '/interview/join' || /^\/api\/recruitment\/applications\/[^/]+\/ai-interviews(?:\/|$)/.test(path)
/** API responses have no executable document. HTML uses compatible frame/base/object restrictions only. */
export const interviewSecurityHeaders: MiddlewareHandler = async (c, next) => {
  const apply = () => {
  c.header('Cache-Control', 'private, no-store, max-age=0')
  c.header('Pragma', 'no-cache')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Content-Security-Policy', c.req.path.startsWith('/api/') ? "default-src 'none'; frame-ancestors 'none'" : "frame-ancestors 'none'; base-uri 'self'; object-src 'none'")
  }
  apply()
  await next()
  apply()
}
