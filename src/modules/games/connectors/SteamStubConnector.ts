/**
 * Steam Stub Connector
 * A mock implementation for testing and development
 */

import {BaseConnector, ConnectorManifest, ExternalGame, SyncResult} from './ConnectorInterface';
import {GameProvider, ConnectorCapability} from '../../../types/InventoryEnums';

const STEAM_STUB_MANIFEST: ConnectorManifest = {
    id: 'steam-stub',
    name: 'Steam (Stub)',
    description: 'Mock Steam connector for testing and development. Returns sample game data.',
    provider: GameProvider.STEAM,
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

// Sample games for the stub connector
const SAMPLE_GAMES: ExternalGame[] = [
    {
        externalGameId: '570',
        name: 'Dota 2',
        playtimeMinutes: 12500,
        lastPlayedAt: new Date('2024-12-01'),
        isInstalled: true,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg',
        rawPayload: {appid: 570, name: 'Dota 2'},
    },
    {
        externalGameId: '730',
        name: 'Counter-Strike 2',
        playtimeMinutes: 5420,
        lastPlayedAt: new Date('2024-11-28'),
        isInstalled: true,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg',
        rawPayload: {appid: 730, name: 'Counter-Strike 2'},
    },
    {
        externalGameId: '1091500',
        name: 'Cyberpunk 2077',
        playtimeMinutes: 1250,
        lastPlayedAt: new Date('2024-10-15'),
        isInstalled: false,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
        rawPayload: {appid: 1091500, name: 'Cyberpunk 2077'},
    },
    {
        externalGameId: '292030',
        name: 'The Witcher 3: Wild Hunt',
        playtimeMinutes: 3200,
        lastPlayedAt: new Date('2024-09-20'),
        isInstalled: false,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/292030/header.jpg',
        rawPayload: {appid: 292030, name: 'The Witcher 3: Wild Hunt'},
    },
    {
        externalGameId: '1245620',
        name: 'Elden Ring',
        playtimeMinutes: 890,
        lastPlayedAt: new Date('2024-08-10'),
        isInstalled: true,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg',
        rawPayload: {appid: 1245620, name: 'Elden Ring'},
    },
    {
        externalGameId: '1174180',
        name: 'Red Dead Redemption 2',
        playtimeMinutes: 2100,
        lastPlayedAt: new Date('2024-07-05'),
        isInstalled: false,
        coverImageUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg',
        rawPayload: {appid: 1174180, name: 'Red Dead Redemption 2'},
    },
];

export class SteamStubConnector extends BaseConnector {
    constructor() {
        super(STEAM_STUB_MANIFEST);
    }
    
    async syncLibrary(tokenRef: string): Promise<SyncResult> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // For stub, any non-empty token is valid
        if (!tokenRef) {
            return {
                success: false,
                games: [],
                error: 'No Steam ID provided',
                timestamp: new Date(),
            };
        }
        
        // Return sample games
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
        return !!tokenRef && tokenRef.length > 0;
    }
}
