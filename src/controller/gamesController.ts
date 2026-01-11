/**
 * Games Controller
 * 
 * REFACTORED: This module now re-exports from the modular games controller structure.
 * 
 * For new code, import from specific controllers directly:
 * - ./games/gameTitleController - Title operations and metadata
 * - ./games/gameReleaseController - Release operations
 * - ./games/gameCopyController - Copy/item operations  
 * - ./games/gameAccountController - External account and sync operations
 * - ./games/gameMappingController - Mapping queue operations
 * - ./games/gamePlatformController - Platform operations
 * - ./games/gameJobsController - Sync job operations
 * 
 * Game copies are stored as Items with type=GAME or GAME_DIGITAL,
 * using the existing Barcode and Loan entities for integration.
 */

// Re-export everything from the modular structure for backwards compatibility
export * from './games';

