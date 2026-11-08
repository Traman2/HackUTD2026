package com.hackutd.realestate

import android.app.Application
import com.hackutd.realestate.data.Repository
import com.hackutd.realestate.data.SessionStore
import com.hackutd.realestate.data.SpacetimeClient
import com.hackutd.realestate.glasses.GlassesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Holds app-wide singletons. */
class RealEstateApp : Application() {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val glasses: GlassesManager by lazy { GlassesManager(this, appScope) }
    val repository: Repository by lazy {
        Repository(
            client = SpacetimeClient(BuildConfig.SPACETIME_HOST, BuildConfig.SPACETIME_DB),
            session = SessionStore(this),
        )
    }
}
