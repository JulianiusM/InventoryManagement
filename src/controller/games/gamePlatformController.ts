/**
 * Game Platform Controller
 * Business logic for platform management operations
 */

import * as platformService from '../../modules/database/services/PlatformService';
import {ExpectedError} from '../../modules/lib/errors';
import {requireAuthenticatedUser} from '../../middleware/authMiddleware';

// ============ Platforms ============

/**
 * Get all platforms for user
 */
export async function listPlatforms(userId: number) {
    requireAuthenticatedUser(userId);
    // Ensure default platforms exist
    await platformService.ensureDefaultPlatforms(userId);
    const platforms = await platformService.getAllPlatforms(userId);
    return {platforms};
}

/**
 * Create a new platform
 */
export async function createPlatform(body: {name: string; description?: string; aliases?: string}, userId: number) {
    requireAuthenticatedUser(userId);
    
    if (!body.name || body.name.trim() === '') {
        throw new ExpectedError('Platform name is required', 'error', 400);
    }
    
    try {
        // First create the platform
        const platform = await platformService.createPlatform({
            name: body.name.trim(),
            description: body.description?.trim() || null,
        }, userId);
        
        // Then set aliases if provided
        if (body.aliases?.trim()) {
            await platformService.setAliases(platform.id, body.aliases.trim());
        }
        
        return platform;
    } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}

/**
 * Delete a platform (non-default only)
 */
export async function deletePlatform(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    try {
        await platformService.deletePlatform(id, userId);
    } catch (error) {
        if (error instanceof Error) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}

/**
 * Update platform
 * Aliases can be updated on both default and custom platforms.
 * Name and description can only be updated on custom platforms.
 */
export async function updatePlatform(id: string, body: {name?: string; description?: string; aliases?: string}, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    try {
        const platform = await platformService.getPlatformById(id, userId);
        if (!platform) {
            throw new ExpectedError('Platform not found', 'error', 404);
        }
        
        // For default platforms, only allow updating aliases
        if (platform.isDefault) {
            // Update aliases only
            await platformService.setAliases(id, body.aliases || null);
        } else {
            // For custom platforms, update all fields including aliases
            if (body.name !== undefined && !body.name.trim()) {
                throw new ExpectedError('Platform name is required', 'error', 400);
            }
            
            await platformService.updatePlatform(id, {
                name: body.name?.trim(),
                description: body.description?.trim() || null,
            }, userId);
            
            // Update aliases
            await platformService.setAliases(id, body.aliases || null);
        }
    } catch (error) {
        if (error instanceof Error && !(error instanceof ExpectedError)) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}

/**
 * Merge two platforms
 * Updates all game releases using the source platform to use the target platform
 */
export async function mergePlatforms(body: {sourceId: string; targetId: string}, userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    
    // Verify ownership of both platforms
    const source = await platformService.getPlatformById(body.sourceId, userId);
    const target = await platformService.getPlatformById(body.targetId, userId);
    
    if (!source) {
        throw new ExpectedError('Source platform not found', 'error', 404);
    }
    if (!target) {
        throw new ExpectedError('Target platform not found', 'error', 404);
    }
    
    if (source.isDefault) {
        throw new ExpectedError('Cannot merge a default platform. Merge custom platforms instead.', 'error', 400);
    }
    
    try {
        return await platformService.mergePlatforms(body.sourceId, body.targetId, userId);
    } catch (error) {
        if (error instanceof Error) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}
