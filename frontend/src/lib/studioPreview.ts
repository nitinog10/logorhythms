/**
 * Normalize the Studio preview URL for the browser context.
 *
 * - HTTPS DocuVerse UI cannot embed HTTP loopback (mixed content) — caller should
 *   treat ``src: null`` and use ``mixedContentBlocked`` (open raw URL in a new tab).
 * - **Do not** rewrite ``localhost`` to ``127.0.0.1``. Some setups get
 *   ``ERR_EMPTY_RESPONSE`` only on ``127.0.0.1``. The backend uses
 *   ``PREVIEW_BROWSER_HOST`` for browser-facing URLs; keep iframe URL aligned.
 */

export type StudioPreviewNormalization = {
  src: string | null
  /** True when the browser will block an http loopback iframe from an https Studio page. */
  mixedContentBlocked: boolean
}

/**
 * True when `origin` is a typical Studio preview iframe (loopback dev server).
 * Used to validate `postMessage` from the embedded app (`element-click`).
 *
 * Historically we matched only ports 4xxx, but Docker publishes random high ports
 * (e.g. 32768–65535) and many frameworks default to 3000/5173/8080 — those
 * messages were incorrectly dropped, so element selection never reached the UI.
 */
export function isTrustedStudioPreviewIframeOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    const host = u.hostname.toLowerCase()
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]' && host !== '::1') {
      return false
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return false
    }
    const portStr = u.port
    const port = portStr
      ? Number(portStr)
      : u.protocol === 'https:'
        ? 443
        : 80
    return Number.isFinite(port) && port >= 1 && port <= 65535
  } catch {
    return false
  }
}

export function normalizeStudioPreviewUrl(
  url: string | null | undefined
): StudioPreviewNormalization {
  const trimmed = (url || '').trim()
  if (!trimmed) {
    return { src: null, mixedContentBlocked: false }
  }

  if (typeof window === 'undefined') {
    return { src: trimmed, mixedContentBlocked: false }
  }

  try {
    const u = new URL(trimmed)
    // Annotate string so control-flow narrowing (https + mixed-content branch) cannot
    // incorrectly exclude IPv6 loopback literals and break builds (see Netlify TS check).
    const host: string = u.hostname.toLowerCase()
    const isIpv6Loopback = host === '[::1]' || host === '::1'
    const isLoopback =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      isIpv6Loopback ||
      host === '0.0.0.0'

    if (
      window.location.protocol === 'https:' &&
      u.protocol === 'http:' &&
      isLoopback
    ) {
      return { src: null, mixedContentBlocked: true }
    }

    if (u.protocol === 'http:' && isLoopback) {
      if (isIpv6Loopback) {
        u.hostname = 'localhost'
        return { src: u.toString(), mixedContentBlocked: false }
      }
      if (host === '0.0.0.0') {
        u.hostname = 'localhost'
        return { src: u.toString(), mixedContentBlocked: false }
      }
    }

    return { src: trimmed, mixedContentBlocked: false }
  } catch {
    return { src: trimmed, mixedContentBlocked: false }
  }
}
