import {AppDataSource} from "../dataSource";
import {Platform} from "../entities/platform/Platform";
import {v4 as uuidv4} from "uuid";

const DEFAULT_PLATFORMS = [
    {name: "PC", description: "Windows/Mac/Linux"},
    {name: "PlayStation 5", description: "Sony PlayStation 5"},
    {name: "PlayStation 4", description: "Sony PlayStation 4"},
    {name: "PlayStation 3", description: "Sony PlayStation 3"},
    {name: "PlayStation 2", description: "Sony PlayStation 2"},
    {name: "PlayStation", description: "Sony PlayStation (PS1)"},
    {name: "PlayStation Vita", description: "Sony PlayStation Vita"},
    {name: "PlayStation Portable", description: "Sony PlayStation Portable (PSP)"},
    {name: "Xbox Series X|S", description: "Microsoft Xbox Series X|S"},
    {name: "Xbox One", description: "Microsoft Xbox One"},
    {name: "Xbox 360", description: "Microsoft Xbox 360"},
    {name: "Xbox", description: "Microsoft Xbox (Original)"},
    {name: "Nintendo Switch", description: "Nintendo Switch/Switch Lite/Switch OLED"},
    {name: "Nintendo 3DS", description: "Nintendo 3DS/2DS"},
    {name: "Nintendo DS", description: "Nintendo DS/DS Lite/DSi"},
    {name: "Nintendo Wii U", description: "Nintendo Wii U"},
    {name: "Nintendo Wii", description: "Nintendo Wii"},
    {name: "Nintendo GameCube", description: "Nintendo GameCube"},
    {name: "Mobile", description: "iOS/Android"},
    {name: "Physical Only", description: "Board games, card games, etc."},
];

/**
 * Platform name aliases for normalization
 * Maps common variations/shorthands to canonical platform names
 * 
 * Example: "PS5", "Playstation 5", "playstation5" all map to "PlayStation 5"
 */
const PLATFORM_ALIASES: Record<string, string> = {
    // PlayStation variations
    'ps5': 'PlayStation 5',
    'playstation5': 'PlayStation 5',
    'playstation 5': 'PlayStation 5',
    'sony playstation 5': 'PlayStation 5',
    
    'ps4': 'PlayStation 4',
    'playstation4': 'PlayStation 4',
    'playstation 4': 'PlayStation 4',
    'sony playstation 4': 'PlayStation 4',
    
    'ps3': 'PlayStation 3',
    'playstation3': 'PlayStation 3',
    'playstation 3': 'PlayStation 3',
    'sony playstation 3': 'PlayStation 3',
    
    'ps2': 'PlayStation 2',
    'playstation2': 'PlayStation 2',
    'playstation 2': 'PlayStation 2',
    'sony playstation 2': 'PlayStation 2',
    
    'ps1': 'PlayStation',
    'psx': 'PlayStation',
    'playstation1': 'PlayStation',
    'playstation 1': 'PlayStation',
    'sony playstation': 'PlayStation',
    
    'psvita': 'PlayStation Vita',
    'ps vita': 'PlayStation Vita',
    'vita': 'PlayStation Vita',
    
    'psp': 'PlayStation Portable',
    
    // Xbox variations
    'xbox series x': 'Xbox Series X|S',
    'xbox series s': 'Xbox Series X|S',
    'xbox series': 'Xbox Series X|S',
    'xsx': 'Xbox Series X|S',
    'xss': 'Xbox Series X|S',
    
    'xbone': 'Xbox One',
    'xb1': 'Xbox One',
    
    'x360': 'Xbox 360',
    'xb360': 'Xbox 360',
    
    'xbox original': 'Xbox',
    'original xbox': 'Xbox',
    
    // Nintendo variations
    'switch': 'Nintendo Switch',
    'ns': 'Nintendo Switch',
    'nx': 'Nintendo Switch',
    
    '3ds': 'Nintendo 3DS',
    'new 3ds': 'Nintendo 3DS',
    '2ds': 'Nintendo 3DS',
    'new 2ds': 'Nintendo 3DS',
    'n3ds': 'Nintendo 3DS',
    
    'nds': 'Nintendo DS',
    'ds': 'Nintendo DS',
    'ds lite': 'Nintendo DS',
    'dsi': 'Nintendo DS',
    
    'wii u': 'Nintendo Wii U',
    'wiiu': 'Nintendo Wii U',
    
    'wii': 'Nintendo Wii',
    
    'gamecube': 'Nintendo GameCube',
    'gc': 'Nintendo GameCube',
    'ngc': 'Nintendo GameCube',
    'gcn': 'Nintendo GameCube',
    
    // PC variations
    'windows': 'PC',
    'mac': 'PC',
    'macos': 'PC',
    'mac os': 'PC',
    'mac os x': 'PC',
    'macintosh': 'PC',
    'linux': 'PC',
    'computer': 'PC',
    'pc windows': 'PC',
    'pc (windows)': 'PC',
    'microsoft windows': 'PC',
    'steam': 'PC',
    'desktop': 'PC',
    
    // Mobile variations
    'ios': 'Mobile',
    'android': 'Mobile',
    'iphone': 'Mobile',
    'ipad': 'Mobile',
};

/**
 * Normalize a platform name to a canonical form
 * 
 * This function:
 * 1. Trims and lowercases the input for comparison
 * 2. Checks against known aliases
 * 3. Returns the canonical name if found, otherwise returns the original trimmed name
 * 
 * @param name The platform name to normalize
 * @returns The canonical platform name
 */
export function normalizePlatformName(name: string): string {
    if (!name) return name;
    
    const trimmed = name.trim();
    const lowercased = trimmed.toLowerCase();
    
    // Check for exact match in aliases
    if (PLATFORM_ALIASES[lowercased]) {
        return PLATFORM_ALIASES[lowercased];
    }
    
    // Check if it's already a canonical name (case-insensitive)
    for (const platform of DEFAULT_PLATFORMS) {
        if (platform.name.toLowerCase() === lowercased) {
            return platform.name;
        }
    }
    
    // Return the original trimmed name if no match found
    return trimmed;
}

export async function getAllPlatforms(ownerId: number): Promise<Platform[]> {
    const repo = AppDataSource.getRepository(Platform);
    return repo.find({
        where: {owner: {id: ownerId}},
        order: {isDefault: "DESC", name: "ASC"},
    });
}

export async function getPlatformById(id: string, ownerId: number): Promise<Platform | null> {
    const repo = AppDataSource.getRepository(Platform);
    return repo.findOne({where: {id, owner: {id: ownerId}}});
}

export async function getPlatformByName(name: string, ownerId: number): Promise<Platform | null> {
    const repo = AppDataSource.getRepository(Platform);
    return repo.findOne({where: {name, owner: {id: ownerId}}});
}

export async function createPlatform(data: {name: string; description?: string | null}, ownerId: number): Promise<Platform> {
    const repo = AppDataSource.getRepository(Platform);
    
    // Check for existing platform with same name
    const existing = await getPlatformByName(data.name.trim(), ownerId);
    if (existing) {
        throw new Error(`Platform "${data.name}" already exists`);
    }

    const platform = repo.create({
        id: uuidv4(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        isDefault: false,
        owner: {id: ownerId},
    });
    return repo.save(platform);
}

export async function deletePlatform(id: string, ownerId: number): Promise<void> {
    const repo = AppDataSource.getRepository(Platform);
    const platform = await getPlatformById(id, ownerId);
    if (!platform) {
        throw new Error("Platform not found");
    }
    if (platform.isDefault) {
        throw new Error("Cannot delete a default platform");
    }
    await repo.delete({id});
}

export async function updatePlatform(id: string, data: {name?: string; description?: string | null}, ownerId: number): Promise<void> {
    const repo = AppDataSource.getRepository(Platform);
    const platform = await getPlatformById(id, ownerId);
    if (!platform) {
        throw new Error("Platform not found");
    }
    if (platform.isDefault) {
        throw new Error("Cannot edit a default platform");
    }
    
    // Check for name conflict
    if (data.name && data.name !== platform.name) {
        const existing = await getPlatformByName(data.name.trim(), ownerId);
        if (existing) {
            throw new Error(`Platform "${data.name}" already exists`);
        }
    }
    
    await repo.update({id}, {
        name: data.name?.trim() ?? platform.name,
        description: data.description?.trim() ?? platform.description,
    });
}

export async function ensureDefaultPlatforms(ownerId: number): Promise<void> {
    const repo = AppDataSource.getRepository(Platform);
    for (const defaultPlatform of DEFAULT_PLATFORMS) {
        const existing = await getPlatformByName(defaultPlatform.name, ownerId);
        if (!existing) {
            const platform = repo.create({
                id: uuidv4(),
                name: defaultPlatform.name,
                description: defaultPlatform.description,
                isDefault: true,
                owner: {id: ownerId},
            });
            await repo.save(platform);
        }
    }
}

export async function getOrCreatePlatform(name: string, ownerId: number): Promise<Platform> {
    const repo = AppDataSource.getRepository(Platform);
    
    // Normalize the platform name to prevent duplicates (e.g., PS5 -> PlayStation 5)
    const normalizedName = normalizePlatformName(name);
    
    let platform = await getPlatformByName(normalizedName, ownerId);
    if (!platform) {
        platform = repo.create({
            id: uuidv4(),
            name: normalizedName,
            description: null,
            isDefault: false,
            owner: {id: ownerId},
        });
        await repo.save(platform);
    }
    return platform;
}
