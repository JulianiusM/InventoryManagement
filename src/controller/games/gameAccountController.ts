/**
 * Game Account Controller
 * Business logic for external account operations
 */

import * as externalAccountService from '../../modules/database/services/ExternalAccountService';
import * as connectorDeviceService from '../../modules/database/services/ConnectorDeviceService';
import * as gameSyncService from '../../modules/games/GameSyncService';
import {connectorRegistry} from '../../modules/games/connectors/ConnectorRegistry';
import {ExpectedError} from '../../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {
    CreateExternalAccountBody,
    ScheduleSyncBody,
    DeviceRegistrationResult,
    ConnectorDevice
} from '../../types/GamesTypes';

// ============ External Accounts ============

export async function listExternalAccounts(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const accounts = await externalAccountService.getAllExternalAccounts(ownerId);
    const connectors = connectorRegistry.getAllManifests();
    
    return {accounts, connectors};
}

export async function createExternalAccount(body: CreateExternalAccountBody, ownerId: number) {
    requireAuthenticatedUser(ownerId);
    
    if (!body.accountName || body.accountName.trim() === '') {
        throw new ExpectedError('Account name is required', 'error', 400);
    }
    
    if (!body.provider || body.provider.trim() === '') {
        throw new ExpectedError('Provider is required', 'error', 400);
    }
    
    return await externalAccountService.createExternalAccount({
        provider: body.provider.trim(), // Now a user-defined string
        accountName: body.accountName.trim(),
        externalUserId: body.externalUserId?.trim() || null,
        tokenRef: body.tokenRef || null,
        ownerId,
    });
}

export async function deleteExternalAccount(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const account = await externalAccountService.getExternalAccountById(id);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    await externalAccountService.deleteExternalAccount(id);
}

// ============ Sync ============

export async function triggerSync(accountId: string, userId: number) {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    return await gameSyncService.syncExternalAccount(accountId, userId);
}

/**
 * Trigger sync asynchronously (for background execution)
 * Same as triggerSync but designed to be called without awaiting
 */
export async function triggerSyncAsync(accountId: string, userId: number) {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        console.error(`Async sync failed: Account ${accountId} not found`);
        return;
    }
    
    if (account.ownerId !== userId) {
        console.error(`Async sync failed: Access denied for account ${accountId}`);
        return;
    }
    
    // Run sync and log result
    const result = await gameSyncService.syncExternalAccount(accountId, userId);
    if (result.success) {
        console.log(`Async sync completed for account ${accountId}: ${result.stats?.entriesProcessed || 0} games`);
    } else {
        console.error(`Async sync failed for account ${accountId}: ${result.error}`);
    }
}

export async function getSyncStatus(accountId: string, userId: number) {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    return await gameSyncService.getSyncStatus(accountId);
}

// ============ Scheduled Sync ============

/**
 * Schedule periodic sync for an account
 */
export async function scheduleAccountSync(
    accountId: string,
    body: ScheduleSyncBody,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    if (body.intervalMinutes < 5) {
        throw new ExpectedError('Minimum sync interval is 5 minutes', 'error', 400);
    }
    
    gameSyncService.scheduleSync(accountId, userId, body.intervalMinutes);
}

/**
 * Cancel scheduled sync for an account
 */
export async function cancelScheduledSync(accountId: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    gameSyncService.cancelScheduledSync(accountId);
}

/**
 * Get list of scheduled syncs
 */
export function getScheduledSyncs(): string[] {
    return gameSyncService.getScheduledSyncs();
}

// ============ Connectors ============

export function getConnectorManifests() {
    return connectorRegistry.getAllManifests();
}

// ============ Devices ============

/**
 * Register a new device for an account
 */
export async function registerDevice(accountId: string, deviceName: string): Promise<DeviceRegistrationResult> {
    if (!deviceName || deviceName.trim() === '') {
        throw new ExpectedError('Device name is required');
    }

    const result = await connectorDeviceService.createDevice(accountId, deviceName.trim());

    return {
        deviceId: result.deviceId,
        deviceName: deviceName.trim(),
        token: result.token,
    };
}

/**
 * List all devices for an account
 */
export async function listDevices(accountId: string): Promise<ConnectorDevice[]> {
    const devices = await connectorDeviceService.getDevicesByAccountId(accountId);

    return devices.map(device => ({
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt || null,
        lastImportAt: device.lastImportAt || null,
        status: device.revokedAt ? 'revoked' as const : 'active' as const,
    }));
}

/**
 * Revoke a device (soft delete)
 */
export async function revokeDevice(accountId: string, deviceId: string): Promise<void> {
    const device = await connectorDeviceService.getDeviceById(deviceId);
    if (!device || device.externalAccountId !== accountId) {
        throw new ExpectedError('Device not found', "error", 404);
    }
    await connectorDeviceService.revokeDevice(deviceId);
}

/**
 * Delete a device permanently
 */
export async function deleteDevice(accountId: string, deviceId: string): Promise<void> {
    const device = await connectorDeviceService.getDeviceById(deviceId);
    if (!device || device.externalAccountId !== accountId) {
        throw new ExpectedError('Device not found', "error", 404);
    }
    await connectorDeviceService.deleteDevice(deviceId);
}

/**
 * Verify a device token
 */
export async function verifyDeviceToken(token: string): Promise<{deviceId: string; accountId: string} | null> {
    if (!token) {
        return null;
    }

    const device = await connectorDeviceService.verifyDeviceToken(token);
    if (!device) {
        return null;
    }

    return {
        deviceId: device.id,
        accountId: device.externalAccountId,
    };
}
