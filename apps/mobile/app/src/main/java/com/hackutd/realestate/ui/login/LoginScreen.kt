package com.hackutd.realestate.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hackutd.realestate.ui.AppButton
import com.hackutd.realestate.ui.appTextFieldColors
import com.hackutd.realestate.ui.repositoryFactory
import com.hackutd.realestate.ui.theme.AppTheme

@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    viewModel: LoginViewModel = viewModel(factory = repositoryFactory(::LoginViewModel)),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(viewModel) {
        viewModel.loggedIn.collect { onLoggedIn() }
    }

    Scaffold { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding(),
            contentAlignment = Alignment.Center,
        ) {
            LoginForm(
                state = state,
                onUsernameChange = viewModel::onUsernameChange,
                onPasswordChange = viewModel::onPasswordChange,
                onSubmit = viewModel::submit,
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .widthIn(max = 480.dp)
                    .padding(horizontal = 24.dp, vertical = 32.dp),
            )
        }
    }
}

@Composable
private fun LoginForm(
    state: LoginUiState,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusManager = LocalFocusManager.current
    var showPassword by rememberSaveable { mutableStateOf(false) }
    val colors = AppTheme.colors

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Logo mark
        Box(
            Modifier.size(40.dp).background(colors.foreground, MaterialTheme.shapes.medium),
            contentAlignment = Alignment.Center,
        ) {
            Text("R", color = colors.background, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Sign in to REALestate", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Field resolution for your spaces",
                style = MaterialTheme.typography.bodyLarge,
                color = colors.muted,
            )
        }
        Spacer(Modifier.height(4.dp))

        OutlinedTextField(
            value = state.username,
            onValueChange = onUsernameChange,
            label = { Text("Username") },
            singleLine = true,
            enabled = !state.loading,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Ascii,
                imeAction = ImeAction.Next,
            ),
            shape = MaterialTheme.shapes.medium,
            colors = appTextFieldColors(),
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = state.password,
            onValueChange = onPasswordChange,
            label = { Text("Password") },
            singleLine = true,
            enabled = !state.loading,
            visualTransformation =
                if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                TextButton(onClick = { showPassword = !showPassword }) {
                    Text(if (showPassword) "Hide" else "Show", color = colors.muted)
                }
            },
            keyboardOptions = KeyboardOptions(
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = {
                focusManager.clearFocus()
                onSubmit()
            }),
            shape = MaterialTheme.shapes.medium,
            colors = appTextFieldColors(),
            modifier = Modifier.fillMaxWidth(),
        )

        AppButton(
            text = "Sign in",
            onClick = {
                focusManager.clearFocus()
                onSubmit()
            },
            enabled = state.canSubmit,
            loading = state.loading,
            large = true,
            modifier = Modifier.fillMaxWidth(),
        )

        state.error?.let {
            Text(
                it,
                color = colors.red,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Text(
            "Don't have an account? Create one on the web app.",
            style = MaterialTheme.typography.bodySmall,
            color = colors.muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        )
    }
}
