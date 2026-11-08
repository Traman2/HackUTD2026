import java.util.Properties

// Machine-specific settings (git-ignored). spacetime.host holds the ngrok URL.
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

plugins {
    alias(libs.plugins.android.application)
    // AGP 9 compiles Kotlin itself; only the Compose compiler plugin is applied here.
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.hackutd.realestate"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.hackutd.realestate"
        // Android 10: the minimum for the Meta Wearables toolkit and the Meta AI app.
        minSdk = 29
        // Android 16, the newest OS the Galaxy S24 Ultra receives.
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        // "0" works while Developer Mode is on in the Meta AI app.
        // Replace with values from the Wearables Developer Center before release.
        manifestPlaceholders["mwdat_application_id"] = "0"
        manifestPlaceholders["mwdat_client_token"] = "0"

        // Without spacetime.host, fall back to USB (`adb reverse tcp:3000 tcp:3000`).
        val host = localProps.getProperty("spacetime.host", "http://127.0.0.1:3000").trimEnd('/')
        buildConfigField("String", "SPACETIME_HOST", "\"$host\"")
        buildConfigField("String", "SPACETIME_DB", "\"hackutd2026\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Networking, navigation, view models, saved login token
    implementation(libs.okhttp)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.compose.material.icons.core)

    // Meta glasses SDK
    implementation(libs.mwdat.core)
    implementation(libs.mwdat.camera)
    // Simulated glasses for testing without hardware.
    implementation(libs.mwdat.mockdevice)
}
