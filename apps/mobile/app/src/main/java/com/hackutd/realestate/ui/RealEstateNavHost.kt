package com.hackutd.realestate.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.hackutd.realestate.ui.login.LoginScreen
import com.hackutd.realestate.ui.spaces.SpacesScreen
import com.hackutd.realestate.ui.tickets.TicketDetailScreen
import com.hackutd.realestate.ui.tickets.TicketDetailViewModel
import com.hackutd.realestate.ui.tickets.TicketsScreen
import com.hackutd.realestate.ui.tickets.TicketsViewModel
import android.net.Uri
import androidx.navigation.NavType
import androidx.navigation.navArgument

object Routes {
    const val LOGIN = "login"
    const val SPACES = "spaces"
    const val TICKETS = "tickets/{spaceId}?spaceName={spaceName}"
    const val TICKET = "ticket/{ticketId}"

    fun tickets(spaceId: Long, spaceName: String) = "tickets/$spaceId?spaceName=${Uri.encode(spaceName)}"
    fun ticket(ticketId: Long) = "ticket/$ticketId"
}

@Composable
fun RealEstateNavHost(
    appViewModel: AppViewModel = viewModel(factory = repositoryFactory(::AppViewModel)),
) {
    val start by appViewModel.start.collectAsStateWithLifecycle()

    Surface(modifier = Modifier.fillMaxSize()) {
        when (val s = start) {
            StartState.Checking -> Centered { CircularProgressIndicator() }
            is StartState.Failed -> StartError(s.message, onRetry = appViewModel::check)
            StartState.SignedOut -> AppNavigation(appViewModel, Routes.LOGIN)
            is StartState.SignedIn -> AppNavigation(appViewModel, Routes.SPACES)
        }
    }
}

@Composable
private fun AppNavigation(appViewModel: AppViewModel, startRoute: String) {
    val navController = rememberNavController()
    val profile by appViewModel.profile.collectAsStateWithLifecycle()

    // Signing out (or the backend dropping the session) clears the profile: go back to Login.
    LaunchedEffect(profile) {
        val route = navController.currentDestination?.route
        if (profile == null && route != null && route != Routes.LOGIN) {
            navController.navigateClearingStack(Routes.LOGIN)
        }
    }

    NavHost(navController = navController, startDestination = startRoute) {
        composable(Routes.LOGIN) {
            LoginScreen(onLoggedIn = { navController.navigateClearingStack(Routes.SPACES) })
        }
        composable(Routes.SPACES) {
            SpacesScreen(onOpenSpace = { space -> navController.navigate(Routes.tickets(space.id, space.name)) })
        }
        composable(
            Routes.TICKETS,
            arguments = listOf(
                navArgument(TicketsViewModel.ARG_SPACE_ID) { type = NavType.LongType },
                navArgument(TicketsViewModel.ARG_SPACE_NAME) {
                    type = NavType.StringType
                    defaultValue = ""
                },
            ),
        ) {
            TicketsScreen(
                onBack = { navController.popBackStack() },
                onOpenTicket = { ticket -> navController.navigate(Routes.ticket(ticket.id)) },
            )
        }
        composable(
            Routes.TICKET,
            arguments = listOf(navArgument(TicketDetailViewModel.ARG_TICKET_ID) { type = NavType.LongType }),
        ) {
            TicketDetailScreen(
                onBack = { navController.popBackStack() },
                // Resolution Mode (guides 06–07) plugs in here.
                onStartResolution = null,
            )
        }
    }
}

private fun NavHostController.navigateClearingStack(route: String) {
    navigate(route) {
        popUpTo(graph.id) { inclusive = true }
        launchSingleTop = true
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

@Composable
private fun StartError(message: String, onRetry: () -> Unit) {
    Centered {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(message, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
            Button(onClick = onRetry) { Text("Retry") }
        }
    }
}
