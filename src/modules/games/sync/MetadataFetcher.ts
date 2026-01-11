/**
 * Metadata Fetcher Module - BACKWARDS COMPATIBLE WRAPPER
 * 
 * This module re-exports the unified MetadataPipeline for backwards compatibility.
 * 
 * The SINGLE UNIFIED IMPLEMENTATION is in MetadataPipeline.ts.
 * This file provides backwards-compatible aliases so existing code
 * continues to work without changes.
 * 
 * All metadata operations go through MetadataPipeline:
 * - Single game processing (manual)
 * - Batch game processing (sync)
 * - Provider search
 * - Metadata application
 * 
 * See MetadataPipeline.ts for the unified implementation.
 */

import {ExternalGame} from '../connectors/ConnectorInterface';
import {GameMetadata, MetadataSearchResult} from '../metadata/MetadataProviderInterface';
import {GameTitle} from '../../database/entities/gameTitle/GameTitle';
import {
    MetadataPipeline,
    MetadataFetchResult,
    getMetadataPipeline,
    enrichGameWithMetadata as pipelineEnrichGameWithMetadata,
    MIN_VALID_DESCRIPTION_LENGTH as PIPELINE_MIN_VALID_DESCRIPTION_LENGTH,
} from './MetadataPipeline';

// Re-export constants
export const MIN_VALID_DESCRIPTION_LENGTH = PIPELINE_MIN_VALID_DESCRIPTION_LENGTH;

// Re-export types
export type {MetadataFetchResult} from './MetadataPipeline';

// Re-export enrichment function
export const enrichGameWithMetadata = pipelineEnrichGameWithMetadata;

/**
 * MetadataFetcher - Backwards Compatible Wrapper
 * 
 * This class wraps MetadataPipeline to provide backwards compatibility
 * with the old API while using the unified implementation internally.
 */
export class MetadataFetcher {
    private pipeline: MetadataPipeline;
    
    constructor() {
        this.pipeline = getMetadataPipeline();
    }
    
    /**
     * Check if provider is rate limited
     */
    isProviderRateLimited(providerId: string): boolean {
        return this.pipeline.isProviderRateLimited(providerId);
    }
    
    /**
     * Mark provider as rate limited
     */
    markProviderRateLimited(providerId: string): void {
        this.pipeline.markProviderRateLimited(providerId);
    }
    
    /**
     * Fetch metadata for games (batch operation)
     * Uses the unified pipeline internally
     */
    async fetchMetadataForGames(
        games: ExternalGame[],
        provider: string
    ): Promise<Map<string, GameMetadata>> {
        return this.pipeline.processGameBatch(games, provider);
    }
    
    /**
     * Fetch metadata for a single game title
     * Uses the unified pipeline internally
     */
    async fetchMetadataForTitle(
        title: GameTitle,
        searchQuery?: string
    ): Promise<MetadataFetchResult> {
        const query = searchQuery?.trim() || title.name;
        return this.pipeline.processGame({
            name: query,
            externalId: title.id,
            gameType: title.type,
        });
    }
    
    /**
     * Search for metadata options from all applicable providers
     * Uses the unified pipeline internally
     */
    async searchMetadataOptions(
        title: GameTitle,
        searchQuery?: string
    ): Promise<MetadataSearchResult[]> {
        const query = searchQuery?.trim() || title.name;
        return this.pipeline.searchOptions(query, title.type);
    }
    
    /**
     * Fetch metadata from a specific provider
     * Uses the unified pipeline internally
     */
    async fetchMetadataFromProvider(
        providerId: string,
        externalId: string
    ): Promise<MetadataFetchResult> {
        return this.pipeline.processGame({
            // name is optional when providerExternalId is provided
            externalId: externalId,
            providerId,
            providerExternalId: externalId,
        });
    }
}

/**
 * Apply GameMetadata to a GameTitle entity
 * Uses the unified pipeline internally
 */
export async function applyMetadataToTitle(
    titleId: string,
    title: GameTitle,
    metadata: GameMetadata
): Promise<{updates: Partial<GameTitle>; fieldsUpdated: string[]}> {
    const pipeline = getMetadataPipeline();
    return pipeline.applyToTitle(titleId, title, metadata, true);
}

// Singleton instance
let metadataFetcherInstance: MetadataFetcher | null = null;

/**
 * Get the singleton MetadataFetcher instance
 */
export function getMetadataFetcher(): MetadataFetcher {
    if (!metadataFetcherInstance) {
        metadataFetcherInstance = new MetadataFetcher();
    }
    return metadataFetcherInstance;
}
