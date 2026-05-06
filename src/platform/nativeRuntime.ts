import type { Router } from 'vue-router'
import { isNativePlatform } from './capacitor'

const toInternalPath = (incoming: string): string => {
  const raw = incoming.trim()
  if (!raw) return '/'

  try {
    const parsed = new URL(raw)
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/'
  } catch {
    return raw.startsWith('/') ? raw : `/${raw}`
  }
}

export const initNativeRuntime = async (router: Router): Promise<void> => {
  if (!isNativePlatform()) return

  const [{ StatusBar, Style }, { SplashScreen }, { Keyboard, KeyboardResize }, { App }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/keyboard'),
    import('@capacitor/app')
  ])

  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined)
  await StatusBar.setStyle({ style: Style.Default }).catch(() => undefined)
  await Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => undefined)

  App.addListener('appUrlOpen', async ({ url }) => {
    const targetPath = toInternalPath(url || '')
    if (targetPath) {
      await router.push(targetPath).catch(() => undefined)
    }
  })

  App.addListener('backButton', async ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
      return
    }
    return
  })

  window.setTimeout(() => {
    void SplashScreen.hide()
  }, 250)
}
