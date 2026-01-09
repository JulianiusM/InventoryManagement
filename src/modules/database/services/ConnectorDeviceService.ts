/**
 * ConnectorDevice Service
 * Generic service for managing devices for push-style connectors
 */

import {AppDataSource} from '../dataSource';
import {ConnectorDevice} from '../entities/connectorDevice/ConnectorDevice';
import {ExternalAccount} from '../entities/externalAccount/ExternalAccount';
import bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const SALT_ROUNDS = 10;
const TOKEN_LENGTH = 32;

/**
 * Generate a secure random token
 */
function generateToken(): string {
    return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Hash a token for secure storage
 */
async function hashToken(token: string): Promise<string> {
    return await bcrypt.hash(token, SALT_ROUNDS);
}

/**
 * Create a new device for an account
 */
export async function createDevice(
    accountId: string,
    deviceName: string
): Promise<{deviceId: string; token: string}> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    const accountRepo = AppDataSource.getRepository(ExternalAccount);
    
    // Verify account exists
    const account = await accountRepo.findOne({where: {id: accountId}});
    if (!account) {
        throw new Error(`Account not found: ${accountId}`);
    }
    
    const token = generateToken();
    const tokenHash = await hashToken(token);
    
    const device = new ConnectorDevice();
    device.externalAccount = {id: accountId} as ExternalAccount;
    device.name = deviceName;
    device.tokenHash = tokenHash;
    
    const saved = await repo.save(device);
    
    return {
        deviceId: saved.id,
        token,
    };
}

/**
 * Get a device by ID
 */
export async function getDeviceById(deviceId: string): Promise<ConnectorDevice | null> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    return await repo.findOne({
        where: {id: deviceId},
        relations: ['externalAccount', 'externalAccount.owner'],
    });
}

/**
 * Get all devices for an account
 */
export async function getDevicesByAccountId(accountId: string): Promise<ConnectorDevice[]> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    return await repo.find({
        where: {externalAccount: {id: accountId}},
        order: {createdAt: 'DESC'},
    });
}

/**
 * Verify a device token and return the device if valid
 */
export async function verifyDeviceToken(token: string): Promise<ConnectorDevice | null> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    
    // Get all non-revoked devices
    const devices = await repo
        .createQueryBuilder('device')
        .leftJoinAndSelect('device.externalAccount', 'account')
        .leftJoinAndSelect('account.owner', 'owner')
        .where('device.revoked_at IS NULL')
        .getMany();
    
    for (const device of devices) {
        const isValid = await bcrypt.compare(token, device.tokenHash);
        if (isValid) {
            // Update last seen
            await updateLastSeenAt(device.id);
            return device;
        }
    }
    
    return null;
}

/**
 * Update the last seen timestamp for a device
 */
export async function updateLastSeenAt(deviceId: string): Promise<void> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    await repo.update({id: deviceId}, {lastSeenAt: new Date()});
}

/**
 * Update the last import timestamp for a device
 */
export async function updateLastImportAt(deviceId: string): Promise<void> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    await repo.update({id: deviceId}, {lastImportAt: new Date()});
}

/**
 * Revoke a device (soft delete)
 */
export async function revokeDevice(deviceId: string): Promise<void> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    await repo.update({id: deviceId}, {revokedAt: new Date()});
}

/**
 * Delete a device permanently
 */
export async function deleteDevice(deviceId: string): Promise<void> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    await repo.delete({id: deviceId});
}

/**
 * Get active devices count for an account
 */
export async function getActiveDevicesCount(accountId: string): Promise<number> {
    const repo = AppDataSource.getRepository(ConnectorDevice);
    return await repo
        .createQueryBuilder('device')
        .where('device.external_account_id = :accountId', {accountId})
        .andWhere('device.revoked_at IS NULL')
        .getCount();
}
