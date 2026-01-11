/**
 * Games Controller Index
 * 
 * Re-exports all games controller functions for backwards compatibility.
 * New code should import from specific controllers directly.
 * 
 * This module provides business logic for the games module:
 * - Game titles: CRUD, metadata, merge operations
 * - Game releases: CRUD, merge operations
 * - Game copies: CRUD, lending, barcodes
 * - Game suggestions: Random game selection based on criteria
 * - External accounts: CRUD, sync, devices
 * - Mapping queue: Pending mappings resolution
 * - Platforms: CRUD, merge operations
 * - Jobs: Sync job listing
 */

// Re-export all controller modules
export * from './gameTitleController';
export * from './gameReleaseController';
export * from './gameCopyController';
export * from './gameAccountController';
export * from './gameMappingController';
export * from './gamePlatformController';
export * from './gameJobsController';
export * from './gameSuggestionController';

// Re-export helpers for advanced use cases
export * from './helpers';

// Import connectors module for initialization
import {initializeConnectors} from '../../modules/games/connectors/ConnectorRegistry';

// Ensure connectors are initialized when this module is loaded
initializeConnectors();
