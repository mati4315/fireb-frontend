import { logEvent } from 'firebase/analytics'
import { analytics } from '@/config/firebase'

type SafeAnalyticsValue = string | number | boolean
type SafeAnalyticsParams = Record<string, SafeAnalyticsValue>

/** Tracks only explicitly selected, non-personal event fields. Never pass user text or IDs. */
export const trackAppEvent = (name: string, params: SafeAnalyticsParams = {}) => {
  if (!analytics) return
  try {
    logEvent(analytics, name, params)
  } catch (error) {
    if (import.meta.env.DEV) console.debug('Analytics event could not be recorded:', error)
  }
}

export const getShareContentType = (url: string): 'secret' | 'news' | 'community' | 'other' => {
  try {
    const path = new URL(url, window.location.origin).pathname
    if (/^\/s(?:\/|$)/.test(path)) return 'secret'
    if (/^\/noticia(?:\/|$)/.test(path)) return 'news'
    if (/^\/c(?:\/|$)/.test(path)) return 'community'
  } catch {
    // Malformed or relative values are safely classified as other.
  }
  return 'other'
}
