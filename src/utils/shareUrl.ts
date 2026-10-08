import { isNativePlatform } from '@/platform/capacitor'

const PUBLIC_ORIGIN = 'https://cdelu.ar'

/** Build a public link that can be opened outside the app's WebView. */
export const buildShareUrl = (path: string): string => {
  const origin = isNativePlatform() ? PUBLIC_ORIGIN : window.location.origin
  return new URL(path, origin).toString()
}
