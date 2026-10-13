# Desktop and mobile apps

The app can be installed as a PWA, packaged as a Windows desktop app, or built as Android/iOS apps with Capacitor. All versions use the production service at `https://alasly-production.up.railway.app`; they require an internet connection and the same user accounts as the web app.

## Install the PWA

Deploy the web app over HTTPS. On desktop, use the browser's **Install app** action. On Android, use **Install app** or **Add to Home screen** in the browser. On iPhone/iPad, open the site in Safari and choose **Add to Home Screen**. The service worker caches the application shell, not private business records or API responses.

## Windows installer

Requirements: Node.js 20.19 or newer and npm.

```sh
cd client
npm ci
npm run windows:installer
```

The NSIS installer and portable x64 executable are written to `client/release`. The desktop shell opens the production website and permits camera access only for that trusted origin. Sign the Windows installer with the organization's code-signing certificate before distributing it publicly.

## Android / Google Play

Requirements: Node.js 20.19 or newer, Android Studio, Android SDK, and a JDK supported by the installed Android Gradle Plugin.

```sh
cd client
npm ci
npx cap add android
npm run android:studio
```

Build an Android App Bundle for Play Console with:

```sh
npm run android:aab
```

Open the Android project in Android Studio, set the final application ID/version and store listing details, configure a release signing key in the local Gradle configuration (never commit it), then build/sign the release AAB. Google Play App Signing and the developer account are required to publish.

## iOS / App Store

Requirements: a Mac with Xcode, an Apple Developer account, and the iOS signing certificate/provisioning profile.

```sh
cd client
npm ci
npx cap add ios
npm run ios:xcode
```

In Xcode, set the final bundle identifier/version, confirm the camera usage description, select the Apple development team, archive the app, and upload it through Organizer/Transporter. App Store Connect metadata, privacy disclosures, screenshots, and Apple's review are still required before release.

## Branding and store readiness

The current application ID is `com.alasly.autocare`. Change it before the first public store release if the organization owns a different identifier; do so consistently in `capacitor.config.ts`, the generated native projects, and the Windows package configuration. Replace the generated artwork in `assets/` and `public/icons/` with approved brand assets before submission.

Store binaries are not committed. Android signing secrets, Apple certificates, store credentials, and publishing accounts must be configured by the application owner in the relevant local build environment.
