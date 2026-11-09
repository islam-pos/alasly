# Desktop and mobile apps

The app can be installed as a PWA, packaged as a Windows desktop app, or built as Android/iOS apps with Capacitor. All versions use the same production API at `https://alasly-production.up.railway.app` and the same user accounts as the web app. Sign in and load the records needed on each device while online before relying on offline access.

## Install the PWA

Deploy the web app over HTTPS. On desktop, use the browser's **Install app** action. On Android, use **Install app** or **Add to Home screen** in the browser. On iPhone/iPad, open the site in Safari and choose **Add to Home Screen**. The service worker caches the application shell. Successful JSON API reads are stored locally for records previously opened on that device.

## Windows installer

Requirements: Node.js 20.19 or newer and npm.

```sh
cd client
npm ci
npm run windows:installer
```

The NSIS installer and portable x64 executable are written to `client/release`. The desktop app bundles the web UI and can open its shell without internet; sign-in, API records, and synchronization still require a connection at least once on each device. It uses a secure app-local origin for persistent IndexedDB storage and the same production API as the web app. Camera access is limited to the bundled app. Sign the Windows installer with the organization's code-signing certificate before distributing it publicly.

## Android / Google Play

Requirements: Node.js 20.19 or newer, Android Studio, Android SDK, and a JDK supported by the installed Android Gradle Plugin. Capacitor's local web bundle is available offline after installation; API data must first be loaded while online.

```sh
cd client
npm ci
npm run android:studio
```

Build an Android App Bundle for Play Console with:

```sh
npm run android:aab
```

Open the Android project in Android Studio, set the final application ID/version and store listing details, configure a release signing key in the local Gradle configuration (never commit it), then build/sign the release AAB. Google Play App Signing and the developer account are required to publish.

## iOS / App Store

Requirements: a Mac with Xcode, an Apple Developer account, and the iOS signing certificate/provisioning profile. Capacitor's local web bundle is available offline after installation; API data must first be loaded while online.

```sh
cd client
npm ci
npm run ios:xcode
```

In Xcode, set the final bundle identifier/version, confirm the camera usage description, select the Apple development team, archive the app, and upload it through Organizer/Transporter. App Store Connect metadata, privacy disclosures, screenshots, and Apple's review are still required before release.

## Branding and store readiness

The current application ID is `com.alasly.autocare`. Change it before the first public store release if the organization owns a different identifier; do so consistently in `capacitor.config.ts`, the generated native projects, and the Windows package configuration. Replace the generated artwork in `assets/` and `public/icons/` with approved brand assets before submission.

Store binaries are not committed. Android signing secrets, Apple certificates, store credentials, and publishing accounts must be configured by the application owner in the relevant local build environment.

## Offline records and synchronization

The client caches successful JSON reads in IndexedDB for up to 30 days (up to 300 recently-used requests per signed-in session). Non-delete API writes that lose connectivity are kept in a device-local outbox with a stable idempotency key. Basic customer, supplier, vehicle, and employee creation can replay automatically after reconnection. Edits and consequential operations require the user to compare the latest server record and explicitly review before sending. Deletes, authentication changes, and file uploads are not queued. An operation that may already have reached the server is held for review rather than blindly resubmitted.

This is not yet a full offline replica: workflows that need an immediate server-generated response or a current shared stock/cash balance still require an internet connection. Pending outbox entries and cached business data remain in the local browser profile; use trusted devices and check the outbox before clearing site/app storage or uninstalling.
