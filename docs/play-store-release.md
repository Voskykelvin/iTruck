# iTruck Android and Play Store release

The Android project in `android/` packages the production web app at
`https://itruck.onrender.com` as a Trusted Web Activity.

## Fixed application identity

- App name: `iTruck Africa`
- Launcher name: `iTruck`
- Android package ID: `com.itruck.africa`
- Production host: `itruck.onrender.com`

The package ID cannot be changed after the first Play Store release.

## Prerequisites

1. Install JDK 17 and the Android command-line SDK.
2. Run `npm run android:doctor`.
3. Accept the Android SDK license terms directly when prompted by the Android tooling.
4. Deploy the web changes so the production manifest and icons are reachable.

## Web/PWA verification

Run:

```sh
npm run pwa:verify
npm run app:build
npm --prefix workspace exec playwright test e2e/pwa.spec.js --project=chromium
```

The production deployment must expose:

- `/manifest.webmanifest`
- `/push-service-worker.js`
- `/offline.html`
- `/assets/icon-192.png`
- `/assets/icon-512.png`
- `/assets/icon-maskable-512.png`

## Updating the Android wrapper

After the PWA files have been deployed:

```sh
npm run android:update
```

This refreshes the generated Android resources from the production manifest.

## Signing

Do not commit a keystore or its passwords.

Create and securely back up a Play upload key, then build with Bubblewrap. The
keystore path and alias are configured in `android/twa-manifest.json`. Passwords
can be passed through `BUBBLEWRAP_KEYSTORE_PASSWORD` and
`BUBBLEWRAP_KEY_PASSWORD`.

For a local compilation check that does not create a publishable artifact:

```sh
npm run android:build:unsigned
```

## Digital Asset Links

After creating the Play Console app:

1. Open Play Console's **App integrity** page.
2. Copy the SHA-256 fingerprint from the **App signing key certificate**.
3. Replace the placeholder in `android/assetlinks.template.json`.
4. Save the completed file as
   `workspace/public/.well-known/assetlinks.json`.
5. Deploy and confirm it is reachable at:
   `https://itruck.onrender.com/.well-known/assetlinks.json`

Use the Play app-signing fingerprint, not only the local upload-key
fingerprint. A mismatch causes the app to open as a Custom Tab with browser
controls instead of a verified fullscreen Trusted Web Activity.

## Play Console checklist

- Create the app using package ID `com.itruck.africa`.
- Enroll in Play App Signing.
- Upload the signed Android App Bundle (`.aab`) to internal testing first.
- Complete the privacy policy and Data safety form.
- Provide the store icon, feature graphic, phone screenshots, short
  description, and full description.
- Test login, booking, document upload/download, push notifications, location,
  payment redirects, deep links, offline fallback, and back-button behavior.
- Promote from internal testing only after Digital Asset Links verification
  succeeds.
