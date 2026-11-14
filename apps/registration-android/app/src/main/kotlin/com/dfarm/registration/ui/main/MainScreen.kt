package com.dfarm.registration.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import com.dfarm.registration.FaceEnrollment
import com.dfarm.registration.R
import com.dfarm.registration.RfidAssignment
import com.dfarm.registration.data.DefaultDataRepository
import com.dfarm.registration.ui.theme.DFarmRegistrationTheme

@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
  viewModel: MainScreenViewModel = viewModel { MainScreenViewModel(DefaultDataRepository()) },
) {
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()
  when (val state = uiState) {
    MainScreenUiState.Loading -> {
      Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
      ) {
        CircularProgressIndicator()
      }
    }
    is MainScreenUiState.Success -> {
      MainScreen(
        data = state.data,
        onEnrollBiometricClick = { customerId, name, code ->
          onItemClick(
            FaceEnrollment(
              customerId = customerId,
              customerName = name,
              farmerCode = code
            )
          )
        },
        onRfidAssignmentClick = {
          onItemClick(RfidAssignment)
        },
        modifier = modifier
      )
    }
    is MainScreenUiState.Error -> {
      Text("Error loading data: ${state.throwable.message}")
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MainScreen(
  data: List<String>,
  onEnrollBiometricClick: (String, String, String) -> Unit = { _, _, _ -> },
  onRfidAssignmentClick: () -> Unit = {},
  modifier: Modifier = Modifier
) {
  Scaffold(
    modifier = modifier,
    topBar = {
      CenterAlignedTopAppBar(
        title = { Text(stringResource(R.string.app_name)) },
        colors = TopAppBarDefaults.topAppBarColors(
          containerColor = MaterialTheme.colorScheme.primaryContainer,
          titleContentColor = MaterialTheme.colorScheme.primary
        )
      )
    }
  ) { innerPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(innerPadding)
        .padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      Text(
        text = "Farmer Identification & Registration Flow",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold
      )

      // Card for Face Enrollment
      Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
      ) {
        Column(modifier = Modifier.padding(16.dp)) {
          Text(text = "Suresh Patil", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
          Text(
            text = "Code: DF-2026-0042 • UUID: c1111111-1111-1111-1111-111111111111",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.outline
          )
          Spacer(modifier = Modifier.height(8.dp))
          Text(
            text = "Biometric Status: Consent Verified • Pending Face Capture",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
          )
          Spacer(modifier = Modifier.height(12.dp))
          Button(
            onClick = {
              onEnrollBiometricClick(
                "c1111111-1111-1111-1111-111111111111",
                "Suresh Patil",
                "DF-2026-0042"
              )
            },
            modifier = Modifier.fillMaxWidth()
          ) {
            Text("Launch Face Enrollment")
          }
        }
      }

      // Card for RFID Card Management (Phase 08)
      Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
      ) {
        Column(modifier = Modifier.padding(16.dp)) {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.CreditCard, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = "RFID Card Assignment & Replacement", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
          }
          Spacer(modifier = Modifier.height(4.dp))
          Text(
            text = "Assign unique RFID card UID, execute replacements, view assignment history, and activate customer registrations.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.outline
          )
          Spacer(modifier = Modifier.height(12.dp))
          Button(
            onClick = onRfidAssignmentClick,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
          ) {
            Text("Open RFID Assignment Screen")
          }
        }
      }

      data.forEach { Greeting(it) }
    }
  }
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
  Text(
    text = "Status: DFarm System Online ($name)",
    modifier = modifier.padding(vertical = 4.dp),
    style = MaterialTheme.typography.bodySmall
  )
}

@Preview(showBackground = true, showSystemUi = true)
@Composable
fun MainScreenPreview() {
  DFarmRegistrationTheme { MainScreen(listOf("Connected")) }
}
