import {AppDataSource} from "../dataSource";
import {Platform} from "../entities/platform/Platform";
import {v4 as uuidv4} from "uuid";

/**
 * Default platforms with their default aliases
 * Aliases are stored in the database for user customization
 */
const DEFAULT_PLATFORMS = [
    {name: "PC", description: "Windows/Mac/Linux", aliases: "windows,mac,macos,mac os,mac os x,macintosh,linux,computer,pc windows,pc (windows),microsoft windows,steam,desktop"},
    {name: "PlayStation 5", description: "Sony PlayStation 5", aliases: "ps5,playstation5,playstation 5,sony playstation 5"},
    {name: "PlayStation 4", description: "Sony PlayStation 4", aliases: "ps4,playstation4,playstation 4,sony playstation 4"},
    {name: "PlayStation 3", description: "Sony PlayStation 3", aliases: "ps3,playstation3,playstation 3,sony playstation 3"},
    {name: "PlayStation 2", description: "Sony PlayStation 2", aliases: "ps2,playstation2,playstation 2,sony playstation 2"},
    {name: "PlayStation", description: "Sony PlayStation (PS1)", aliases: "ps1,psx,playstation1,playstation 1,sony playstation"},
    {name: "PlayStation Vita", description: "Sony PlayStation Vita", aliases: "psvita,ps vita,vita"},
    {name: "PlayStation Portable", description: "Sony PlayStation Portable (PSP)", aliases: "psp"},
    {name: "Xbox Series X|S", description: "Microsoft Xbox Series X|S", aliases: "xbox series x,xbox series s,xbox series,xsx,xss"},
    {name: "Xbox One", description: "Microsoft Xbox One", aliases: "xbone,xb1"},
    {name: "Xbox 360", description: "Microsoft Xbox 360", aliases: "x360,xb360"},
    {name: "Xbox", description: "Microsoft Xbox (Original)", aliases: "xbox original,original xbox"},
    {name: "Nintendo Switch", description: "Nintendo Switch/Switch Lite/Switch OLED", aliases: "switch,ns,nx"},
    {name: "Nintendo 3DS", description: "Nintendo 3DS/2DS", aliases: "3ds,new 3ds,2ds,new 2ds,n3ds"},
    {name: "Nintendo DS", description: "Nintendo DS/DS Lite/DSi", aliases: "nds,ds,ds lite,dsi"},
    {name: "Nintendo Wii U", description: "Nintendo Wii U", aliases: "wii u,wiiu"},
    {name: "Nintendo Wii", description: "Nintendo Wii", aliases: "wii"},
    {name: "Nintendo GameCube", description: "Nintendo GameCube", aliases: "gamecube,gc,ngc,gcn"},
    {name: "Mobile", description: "iOS/Android", aliases: "ios,android,iphone,ipad"},
    {name: "Physical Only", description: "Board games, card games, etc.", aliases: ""},
];

/**
 * Build a runtime alias map from default platform definitions
 * This is used only during initial default platform creation, not for normalization
 */
function buildDefaultAliasMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const platform of DEFAULT_PLATFORMS) {
        if (platform.aliases) {
            const aliases = platform.aliases.split(',').map(a => a.trim().toLowerCase());
            for (const alias of aliases) {
                if (alias) {
                    map[alias] = platform.name;
                }
            }
        }
        // Also add the platform name itself (lowercased)
        map[platform.name.toLowerCase()] = platform.name;
    }
    return map;
}

/**
 * Get default alias map (cached for performance)
 * Only used by normalizePlatformName() for connectors that can't do async DB lookup
 */
let cachedDefaultAliasMap: Record<string, string> | null = null;
function getDefaultAliasMap(): Record<string, string> {
    if (!cachedDefaultAliasMap) {
        cachedDefaultAliasMap = buildDefaultAliasMap();
    }
    return cachedDefaultAliasMap;
}

/**
 * Normalize a platform name to a canonical form (synchronous version)
 * 
 * This function uses the default platform definitions (built at runtime from DEFAULT_PLATFORMS).
 * For user-defined aliases in the database, use normalizePlatformNameWithDb().
 * 
 * Use cases:
 * - Connector preprocessing before database is accessed
 * - Quick normalization without async context
 * 
 * @param name The platform name to normalize
 * @returns The canonical platform name
 */
export function normalizePlatformName(name: string): string {
    if (!name) return name;
    
    const trimmed = name.trim();
    const lowercased = trimmed.toLowerCase();
    const aliasMap = getDefaultAliasMap();
    
    // Check for match in default alias map
    if (aliasMap[lowercased]) {
        return aliasMap[lowercased];
    }
    
    // Return the original trimmed name if no match found
    return trimmed;
}

/**
 * Normalize a platform name using database aliases (async version)
 * 
 * This function checks user-defined aliases in the database.
 * If no match is found in the database, uses the default alias map.
 * 
 * @param name The platform name to normalize
 * @param ownerId The owner ID to scope the alias lookup
 * @returns The canonical platform name
 */
export async function normalizePlatformNameWithDb(name: string, ownerId: number): Promise<string> {
    if (!name) return name;
    
    const trimmed = name.trim();
    const lowercased = trimmed.toLowerCase();
    
    // First, check user-defined aliases in the database
    const repo = AppDataSource.getRepository(Platform);
    const platforms = await repo.find({where: {owner: {id: ownerId}}});
    
    for (const platform of platforms) {
        // Check if input matches platform name exactly (case-insensitive)
        if (platform.name.toLowerCase() === lowercased) {
            return platform.name;
        }
        
        // Check if input matches any of the aliases
        if (platform.aliases) {
            const aliasList = platform.aliases.split(',').map(a => a.trim().toLowerCase());
            if (aliasList.includes(lowercased)) {
                return platform.name;
            }
        }
    }
    
    // Fall back to default alias map (derived from DEFAULT_PLATFORMS)
    const aliasMap = getDefaultAliasMap();
    if (aliasMap[lowercased]) {
        return aliasMap[lowercased];
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
                aliases: defaultPlatform.aliases || null,
                isDefault: true,
                owner: {id: ownerId},
            });
            await repo.save(platform);
        }
    }
}

export async function getOrCreatePlatform(name: string, ownerId: number): Promise<Platform> {
    const repo = AppDataSource.getRepository(Platform);
    
    // Normalize the platform name using database aliases
    const normalizedName = await normalizePlatformNameWithDb(name, ownerId);
    
    let platform = await getPlatformByName(normalizedName, ownerId);
    if (!platform) {
        platform = repo.create({
            id: uuidv4(),
            name: normalizedName,
            description: null,
            aliases: null,
            isDefault: false,
            owner: {id: ownerId},
        });
        await repo.save(platform);
    }
    return platform;
}

/**
 * Update platform aliases directly (without lookup)
 * @param id Platform ID
 * @param aliases Comma-separated list of aliases
 */
export async function setAliases(id: string, aliases: string | null): Promise<void> {
    const repo = AppDataSource.getRepository(Platform);
    await repo.update({id}, {aliases: aliases?.trim() || null});
}

/**
 * Get all aliases for a platform as an array
 */
export function getAliasesArray(platform: Platform): string[] {
    if (!platform.aliases) return [];
    return platform.aliases.split(',').map(a => a.trim()).filter(a => a.length > 0);
}

/**
 * Merge two platforms
 * Updates all game releases using the source platform to use the target platform,
 * then deletes the source platform
 * 
 * @param sourceId The platform to merge FROM (will be deleted)
 * @param targetId The platform to merge INTO (will be kept)
 * @param ownerId Owner ID for verification
 * @returns Number of releases updated
 */
export async function mergePlatforms(sourceId: string, targetId: string, ownerId: number): Promise<number> {
    const repo = AppDataSource.getRepository(Platform);
    const gameReleaseRepo = AppDataSource.getRepository(GameRelease);
    
    // Get source and target platforms
    const source = await getPlatformById(sourceId, ownerId);
    const target = await getPlatformById(targetId, ownerId);
    
    if (!source) {
        throw new Error('Source platform not found');
    }
    if (!target) {
        throw new Error('Target platform not found');
    }
    
    if (sourceId === targetId) {
        throw new Error('Cannot merge a platform with itself');
    }
    
    // Update all game releases using source platform to use target platform
    const result = await gameReleaseRepo
        .createQueryBuilder()
        .update()
        .set({platform: target.name})
        .where('platform = :sourceName', {sourceName: source.name})
        .andWhere('owner_id = :ownerId', {ownerId})
        .execute();
    
    // Merge aliases: add source aliases (and source name) to target
    const sourceAliases = getAliasesArray(source);
    const targetAliases = getAliasesArray(target);
    
    // Add source name as an alias (since it's being merged)
    if (!targetAliases.includes(source.name.toLowerCase())) {
        targetAliases.push(source.name.toLowerCase());
    }
    
    // Add all source aliases that aren't already in target
    for (const alias of sourceAliases) {
        const lowerAlias = alias.toLowerCase();
        if (!targetAliases.some(a => a.toLowerCase() === lowerAlias)) {
            targetAliases.push(alias);
        }
    }
    
    // Update target with merged aliases
    await setAliases(targetId, targetAliases.join(', '));
    
    // Delete the source platform
    await repo.delete({id: sourceId});
    
    return result.affected || 0;
}

// Import GameRelease for merge function
import {GameRelease} from "../entities/gameRelease/GameRelease";
