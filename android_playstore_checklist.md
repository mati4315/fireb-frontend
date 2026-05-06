# Android + Play Store Checklist (Cdelu.ar)

## Project identity
- App name: `Cdelu.ar`
- App id: `cdelu.ar.app`
- Domain deep links: `https://cdelu.ar`

## Build commands
```bash
npm install
npm run android:build
```

Then open Android Studio:
```bash
npm run cap:open
```

## Required manual credentials
1. Add `google-services.json` into `android/app/google-services.json`.
2. In Firebase Console > Authentication > Sign-in method:
   - Enable Google
   - Enable Facebook
3. Add Android SHA-1/SHA-256 fingerprints in Firebase project settings.
4. Configure Facebook OAuth redirect and package in Meta Developer dashboard.
5. Ensure `https://cdelu.ar` is configured for App Links verification.

## Push notifications
- Android permissions and Capacitor push plugin are already integrated.
- On login, app registers Android token via callable `registerNotificationDevice`.
- On logout, app unregisters via callable `unregisterNotificationDevice`.

## Keystore (Play Store)
`keytool` is required and was not available in this environment.
Generate keystore on your build machine:

```bash
keytool -genkeypair -v -keystore cdelu-release.keystore -alias cdelu-release -keyalg RSA -keysize 2048 -validity 10000
```

Place keystore in a safe path and set local Gradle properties:

```properties
MYAPP_UPLOAD_STORE_FILE=../keystores/cdelu-release.keystore
MYAPP_UPLOAD_KEY_ALIAS=cdelu-release
MYAPP_UPLOAD_STORE_PASSWORD=your_store_password
MYAPP_UPLOAD_KEY_PASSWORD=your_key_password
```

## Release output
In Android Studio:
- Build > Generate Signed Bundle/APK
- Select Android App Bundle (`.aab`)
- Upload `.aab` to Play Console (Internal testing first)

## Final validation
- Login email/password works
- Login Google works on Android device
- Login Facebook works on Android device
- Push arrives in foreground/background/terminated
- Opening push navigates to target route
- Feed scroll and image upload feel fluid on real device
