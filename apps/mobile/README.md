# Invisible Network — Android app

Native Kotlin (Jetpack Compose) app that connects to Ray-Ban Meta glasses (Wayfarer Gen 2)
through the [Meta Wearables Device Access Toolkit](https://wearables.developer.meta.com/docs/getting-started-toolkit).

- **minSdk 29** (Android 10, required by the toolkit) · **target/compile SDK 36** (Android 16)
- Toolkit modules: `mwdat-core`, `mwdat-camera`, `mwdat-mockdevice` (simulated glasses).
  `mwdat-display` is left out because it only targets Meta Ray-Ban Display glasses.

## Run on your phone

1. Open this folder (`apps/mobile`) in Android Studio and let Gradle sync.
2. On the phone: enable Developer options → USB debugging, then plug it in.
3. Select the phone in the device dropdown and press Run.

From a terminal instead:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew installDebug
```

## Before using the glasses

- Install the Meta AI app (v254+), pair the glasses, and turn on Developer Mode in its settings.
- While Developer Mode is on, the app ID and client token in `app/build.gradle.kts` can stay `"0"`.
  Replace them with values from the Wearables Developer Center for a release build.
- Meta AI returns to this app through the `invisiblenetwork://` URL scheme (see `AndroidManifest.xml`).
