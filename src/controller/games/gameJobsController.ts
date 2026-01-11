/**
 * Game Jobs Controller
 * Business logic for sync job operations
 */

import * as syncJobService from '../../modules/database/services/SyncJobService';
import {requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {SyncStatus} from '../../types/InventoryEnums';
import settings from '../../modules/settings';

// ============ Jobs Overview ============

/**
 * List all sync jobs for the jobs overview page
 */
export async function listJobs(ownerId: number, options?: {
    status?: string;
    page?: number;
    limit?: number;
}) {
    requireAuthenticatedUser(ownerId);
    
    const page = options?.page || 1;
    const limit = options?.limit || settings.value.paginationDefaultLocations;
    const offset = (page - 1) * limit;
    
    // Parse status filter
    let statusFilter: SyncStatus | undefined;
    if (options?.status && Object.values(SyncStatus).includes(options.status as SyncStatus)) {
        statusFilter = options.status as SyncStatus;
    }
    
    const {jobs, total} = await syncJobService.getAllJobsForUser(ownerId, {
        status: statusFilter,
        limit,
        offset,
    });
    
    const totalPages = Math.ceil(total / limit);
    
    return {
        jobs,
        total,
        page,
        totalPages,
        statusFilter: options?.status || '',
    };
}
