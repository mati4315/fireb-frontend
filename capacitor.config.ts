import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cdelu.ar.app',
  appName: 'Cdelu.ar',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      backgroundColor: '#fb8c00',
      androidSplashResourceName: 'splash',
      showSpinner: false
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DEFAULT'
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'facebook.com']
    }
  }
};

export default config;
