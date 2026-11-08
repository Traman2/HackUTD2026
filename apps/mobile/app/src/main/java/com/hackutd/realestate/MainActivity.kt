package com.hackutd.realestate

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.hackutd.realestate.ui.RealEstateNavHost
import com.hackutd.realestate.ui.theme.RealEstateTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            RealEstateTheme {
                RealEstateNavHost()
            }
        }
    }
}
