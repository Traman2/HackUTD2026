plugins {
    alias(libs.plugins.android.application)
    // AGP 9 compiles Kotlin itself; only the Compose compiler plugin is applied here.
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.hackutd.invisiblenetwork"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.hackutd.invisiblenetwork"
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

    // Meta glasses SDK
    implementation(libs.mwdat.core)
    implementation(libs.mwdat.camera)
    // Simulated glasses for testing without hardware.
    implementation(libs.mwdat.mockdevice)
}
