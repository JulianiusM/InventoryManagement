import bcrypt from 'bcryptjs';
import {v4 as uuidv4} from 'uuid';
import {AppDataSource} from '../dataSource';
import {PlayniteDevice} from '../entities/playniteDevice/PlayniteDevice';
import {User} from '../entities/user/User';

const SALT_ROUNDS = 10;

export interface CreateDeviceResult {
    deviceId: string;
    token: string;
}

export async function createDevice(userId: number, deviceName: string): Promise<CreateDeviceResult> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    
    // Generate a unique token
    const token = uuidv4() + '-' + uuidv4();
    const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
    
    const device = new PlayniteDevice();
    device.user = {id: userId} as User;
    device.name = deviceName.trim();
    device.tokenHash = tokenHash;
    
    const saved = await repo.save(device);
    
    return {
        deviceId: saved.id,
        token: token,
    };
}

export async function getDeviceById(deviceId: string): Promise<PlayniteDevice | null> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    return await repo.findOne({
        where: {id: deviceId},
        relations: ['user'],
    });
}

export async function getDevicesByUserId(userId: number): Promise<PlayniteDevice[]> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    return await repo.find({
        where: {user: {id: userId}},
        order: {createdAt: 'DESC'},
    });
}

export async function verifyToken(deviceId: string, token: string): Promise<PlayniteDevice | null> {
    const device = await getDeviceById(deviceId);
    if (!device) {
        return null;
    }
    
    // Check if device is revoked
    if (device.revokedAt) {
        return null;
    }
    
    // Verify token hash
    const isValid = await bcrypt.compare(token, device.tokenHash);
    if (!isValid) {
        return null;
    }
    
    // Update last seen
    await updateLastSeenAt(deviceId);
    
    return device;
}

export async function verifyTokenByToken(token: string): Promise<PlayniteDevice | null> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    
    // Get all non-revoked devices and check token against each
    // This is less efficient but necessary since we only store hashed tokens
    const devices = await repo.find({
        where: {revokedAt: undefined},
        relations: ['user'],
    });
    
    for (const device of devices) {
        // Also check for devices where revokedAt is null (not undefined)
        if (device.revokedAt !== null && device.revokedAt !== undefined) {
            continue;
        }
        
        const isValid = await bcrypt.compare(token, device.tokenHash);
        if (isValid) {
            // Update last seen
            await updateLastSeenAt(device.id);
            return device;
        }
    }
    
    return null;
}

export async function updateLastSeenAt(deviceId: string): Promise<void> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    await repo.update({id: deviceId}, {lastSeenAt: new Date()});
}

export async function updateLastImportAt(deviceId: string): Promise<void> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    await repo.update({id: deviceId}, {lastImportAt: new Date()});
}

export async function revokeDevice(deviceId: string): Promise<void> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    await repo.update({id: deviceId}, {revokedAt: new Date()});
}

export async function deleteDevice(deviceId: string): Promise<void> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    await repo.delete({id: deviceId});
}

export async function getActiveDevicesCount(userId: number): Promise<number> {
    const repo = AppDataSource.getRepository(PlayniteDevice);
    return await repo.count({
        where: {
            user: {id: userId},
            revokedAt: undefined,
        },
    });
}
