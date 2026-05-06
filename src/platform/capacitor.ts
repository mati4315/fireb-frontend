import { Capacitor } from '@capacitor/core'

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform()

export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android'

export const buildStableDeviceId = async (): Promise<string> => {
  if (!isNativePlatform()) {
    return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  }

  const { Device } = await import('@capacitor/device')
  const info = await Device.getId()
  const identifier = (info.identifier || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96)
  return identifier || `android_${Date.now().toString(36)}`
}
