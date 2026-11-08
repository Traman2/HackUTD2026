package com.hackutd.realestate

import android.app.Application
import com.hackutd.realestate.data.Repository
import com.hackutd.realestate.data.SessionStore
import com.hackutd.realestate.data.SpacetimeClient

/** Holds app-wide singletons. */
class RealEstateApp : Application() {
    val repository: Repository by lazy {
        Repository(
            client = SpacetimeClient(BuildConfig.SPACETIME_HOST, BuildConfig.SPACETIME_DB),
            session = SessionStore(this),
        )
    }
}
