package com.hackutd.realestate.glasses

import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus

/** Activity-owned launchers; never retained by the app-wide manager. */
interface WearablesPermissionRequester {
    suspend fun requestBluetoothPermission(): Boolean
    suspend fun requestWearablesPermission(permission: Permission): PermissionStatus
}
