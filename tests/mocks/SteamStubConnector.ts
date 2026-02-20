/**
 * Steam Stub Connector
 * A mock implementation for testing and development
 * Provides complete game metadata including player counts
 */

import {BaseConnector, ConnectorManifest, ExternalGame, SyncResult} from '../../src/modules/games/connectors/ConnectorInterface';
import {ConnectorCapability} from '../../src/types/InventoryEnums';

const STEAM_STUB_MANIFEST: ConnectorManifest = {
    id: 'steam-stub',
    name: 'Steam (Stub)',
    description: 'Mock Steam connector for testing and development. Returns sample game data with complete metadata.',
    provider: 'steam', // Changed from enum to string
    capabilities: [
        ConnectorCapability.LIBRARY_SYNC,
        ConnectorCapability.PLAYTIME_SYNC,
        ConnectorCapability.INSTALLED_SYNC,
    ],
    version: '1.0.0',
    configSchema: {
        type: 'object',
        properties: {
            apiKey: {type: 'string', description: 'Steam Web API key'},
            steamId: {type: 'string', description: 'Steam User ID (64-bit)'},
        },
        required: ['steamId'],
    },
};

// Sample games for the stub connector with complete metadata
const SAMPLE_GAMES: ExternalGame[] = [
    {
        externalGameId: '570',
        name: 'Dota 2',
        playtimeMinutes: 12500,
        lastPlayedAt: new Date('2024-12-01'),
        isInstalled: true,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg',
        rawPayload: {appid: 570, name: 'Dota 2'},
        platform: 'PC', // Platform now as string
        // Player metadata
        overallMinPlayers: 1,
        overallMaxPlayers: 10,
        supportsOnline: true,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        onlineMinPlayers: 2,
        onlineMaxPlayers: 10,
        description: 'A competitive MOBA game',
        genres: ['MOBA', 'Strategy'],
        developer: 'Valve',
        publisher: 'Valve',
    },
    {
        externalGameId: '730',
        name: 'Counter-Strike 2',
        playtimeMinutes: 5420,
        lastPlayedAt: new Date('2024-11-28'),
        isInstalled: true,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg',
        rawPayload: {appid: 730, name: 'Counter-Strike 2'},
        platform: 'PC',
        overallMinPlayers: 1,
        overallMaxPlayers: 10,
        supportsOnline: true,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        onlineMinPlayers: 2,
        onlineMaxPlayers: 10,
        description: 'Tactical first-person shooter',
        genres: ['FPS', 'Action'],
        developer: 'Valve',
        publisher: 'Valve',
    },
    {
        externalGameId: '1091500',
        name: 'Cyberpunk 2077',
        playtimeMinutes: 1250,
        lastPlayedAt: new Date('2024-10-15'),
        isInstalled: false,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
        rawPayload: {appid: 1091500, name: 'Cyberpunk 2077'},
        platform: 'PC',
        overallMinPlayers: 1,
        overallMaxPlayers: 1,
        supportsOnline: false,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        description: 'Open-world action RPG set in Night City',
        genres: ['RPG', 'Action', 'Open World'],
        developer: 'CD Projekt Red',
        publisher: 'CD Projekt',
    },
    {
        externalGameId: '292030',
        name: 'The Witcher 3: Wild Hunt',
        playtimeMinutes: 3200,
        lastPlayedAt: new Date('2024-09-20'),
        isInstalled: false,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/292030/header.jpg',
        rawPayload: {appid: 292030, name: 'The Witcher 3: Wild Hunt'},
        platform: 'PC',
        overallMinPlayers: 1,
        overallMaxPlayers: 1,
        supportsOnline: false,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        description: 'Story-driven open world RPG',
        genres: ['RPG', 'Action', 'Open World'],
        developer: 'CD Projekt Red',
        publisher: 'CD Projekt',
    },
    {
        externalGameId: '1245620',
        name: 'Elden Ring',
        playtimeMinutes: 890,
        lastPlayedAt: new Date('2024-08-10'),
        isInstalled: true,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg',
        rawPayload: {appid: 1245620, name: 'Elden Ring'},
        platform: 'PC',
        overallMinPlayers: 1,
        overallMaxPlayers: 4,
        supportsOnline: true,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        onlineMinPlayers: 1,
        onlineMaxPlayers: 4,
        description: 'Open-world action RPG by FromSoftware',
        genres: ['Action', 'RPG', 'Souls-like'],
        developer: 'FromSoftware',
        publisher: 'Bandai Namco',
    },
    {
        externalGameId: '1174180',
        name: 'Red Dead Redemption 2',
        playtimeMinutes: 2100,
        lastPlayedAt: new Date('2024-07-05'),
        isInstalled: false,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg',
        rawPayload: {appid: 1174180, name: 'Red Dead Redemption 2'},
        platform: 'PC',
        overallMinPlayers: 1,
        overallMaxPlayers: 32,
        supportsOnline: true,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        onlineMinPlayers: 1,
        onlineMaxPlayers: 32,
        description: 'Epic tale of outlaw life in America\'s heartland',
        genres: ['Action', 'Adventure', 'Open World'],
        developer: 'Rockstar Games',
        publisher: 'Rockstar Games',
    },
];

export class SteamStubConnector extends BaseConnector {
    constructor() {
        super(STEAM_STUB_MANIFEST);
    }
    
    async syncLibrary(_tokenRef: string): Promise<SyncResult> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Stub connector always returns sample games for testing
        // In a real connector, tokenRef would be validated
        return {
            success: true,
            games: SAMPLE_GAMES,
            timestamp: new Date(),
        };
    }
    
    async validateCredentials(tokenRef: string): Promise<boolean> {
        // Simulate validation delay
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // For stub, any non-empty token is valid
        return Boolean(tokenRef);
    }
}
