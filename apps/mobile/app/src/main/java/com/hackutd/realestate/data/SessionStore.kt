package com.hackutd.realestate.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.sessionDataStore by preferencesDataStore(name = "session")

/** Saves the SpacetimeDB identity token so the device keeps the same identity. */
class SessionStore(private val context: Context) {
    private val tokenKey = stringPreferencesKey("spacetime_token")

    suspend fun token(): String? = context.sessionDataStore.data.map { it[tokenKey] }.first()

    suspend fun save(token: String) {
        context.sessionDataStore.edit { it[tokenKey] = token }
    }

    suspend fun clear() {
        context.sessionDataStore.edit { it.remove(tokenKey) }
    }
}
