package com.hackutd.realestate.ui

import com.hackutd.realestate.data.SpacetimeException

/** Turns any failure into a sentence the user can act on. */
fun Throwable.userMessage(): String = when {
    message?.contains("Invalid username or password", ignoreCase = true) == true ->
        "Invalid username or password."
    // SpacetimeClient already turns network failures into a "Can't reach the server" message.
    this is SpacetimeException -> message ?: "Something went wrong. Try again."
    else -> "Something went wrong. Try again."
}

/** True when the backend says this device no longer has a session. */
fun Throwable.isLoggedOut(): Boolean =
    message?.contains("Log in first", ignoreCase = true) == true
