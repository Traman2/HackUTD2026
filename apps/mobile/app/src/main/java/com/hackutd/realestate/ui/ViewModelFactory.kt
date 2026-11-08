package com.hackutd.realestate.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.hackutd.realestate.RealEstateApp
import com.hackutd.realestate.data.Repository

/** Builds a ViewModel factory that hands the app-wide Repository to the ViewModel. */
inline fun <reified VM : ViewModel> repositoryFactory(
    crossinline create: (Repository) -> VM,
): ViewModelProvider.Factory = viewModelFactory {
    initializer { create((this[APPLICATION_KEY] as RealEstateApp).repository) }
}

/**
 * Factory for ViewModels that also need other app singletons or navigation arguments
 * (the SavedStateHandle holds the route's arguments, e.g. spaceId).
 */
inline fun <reified VM : ViewModel> appFactory(
    crossinline create: (RealEstateApp, SavedStateHandle) -> VM,
): ViewModelProvider.Factory = viewModelFactory {
    initializer { create(this[APPLICATION_KEY] as RealEstateApp, createSavedStateHandle()) }
}
