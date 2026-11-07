import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native shell around the web app.
 *
 * `webDir` points at the same `dist/` a browser deployment serves, so the app in
 * the store and the app on the web are built from one source — there is no
 * second copy of the interface to keep in step.
 *
 * ---
 *
 * The session cookie decides how this is configured, so it is worth stating.
 *
 * The cookie is httpOnly and, in production, `SameSite=None; Secure`. A request
 * from the shell to the API is cross-site, so `None` is required — and `None`
 * without `Secure` is rejected by every current browser engine. That gives two
 * workable arrangements and no others:
 *
 *  1. RELEASE — assets bundled, `VITE_API_URL` an absolute **https** address.
 *     Webview origin is https://localhost, API is https://…, cookie is
 *     `None; Secure`, and it travels. This is what ships to Play.
 *
 *  2. DEV ON A PHONE — set `CAP_SERVER_URL` to the dev server on the LAN. The
 *     shell then loads the interface *from* that server, so the webview origin
 *     and the API origin are the same and the ordinary `Lax` cookie works,
 *     exactly as it does in a desktop browser.
 *
 * What does NOT work is a bundled build pointed at a plain-http LAN API: the
 * cookie needs `Secure`, and `Secure` needs https. Trying it looks like a
 * successful sign-in followed by every later request coming back 401.
 */
const devServerUrl = process.env.CAP_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.menaitech.hr',
  appName: 'Menaitech HR',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
    // Present only for on-device development; absent from a release build.
    ...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
  },
}

export default config
