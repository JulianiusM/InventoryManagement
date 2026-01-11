import {AppDataSource} from "../dataSource";
import {Platform} from "../entities/platform/Platform";
import {v4 as uuidv4} from "uuid";

/**
 * Default platforms with their default aliases
 * Aliases are stored in the database for user customization
 * Includes manufacturer name variations for common platforms
 */
const DEFAULT_PLATFORMS = [
    // PC - covers Windows, Mac, Linux, and common variations
    {name: "PC", description: "Windows/Mac/Linux", aliases: "windows,mac,macos,mac os,mac os x,macintosh,linux,ubuntu,computer,pc windows,pc (windows),microsoft windows,steam,desktop,win,win32,win64,ibm pc,personal computer,windows pc,pc game,pc games,pc gaming,windows gaming,windows 10,windows 11,windows 7,windows 8"},
    
    // PlayStation family - Sony
    {name: "PlayStation 5", description: "Sony PlayStation 5", aliases: "ps5,playstation5,playstation 5,sony playstation 5,sony ps5,ps5 digital,playstation 5 digital edition,sony ps 5"},
    {name: "PlayStation 4", description: "Sony PlayStation 4", aliases: "ps4,playstation4,playstation 4,sony playstation 4,sony ps4,ps4 pro,ps4 slim,playstation 4 pro,playstation 4 slim,sony ps 4"},
    {name: "PlayStation 3", description: "Sony PlayStation 3", aliases: "ps3,playstation3,playstation 3,sony playstation 3,sony ps3,ps3 slim,ps3 super slim,sony ps 3"},
    {name: "PlayStation 2", description: "Sony PlayStation 2", aliases: "ps2,playstation2,playstation 2,sony playstation 2,sony ps2,ps2 slim,sony ps 2"},
    {name: "PlayStation", description: "Sony PlayStation (PS1)", aliases: "ps1,psx,playstation1,playstation 1,sony playstation,ps one,psone,sony ps1,sony ps 1"},
    {name: "PlayStation Vita", description: "Sony PlayStation Vita", aliases: "psvita,ps vita,vita,sony vita,playstation vita,sony psvita,sony playstation vita"},
    {name: "PlayStation Portable", description: "Sony PlayStation Portable (PSP)", aliases: "psp,sony psp,sony playstation portable"},
    
    // Xbox family - Microsoft
    {name: "Xbox Series X|S", description: "Microsoft Xbox Series X|S", aliases: "xbox series x,xbox series s,xbox series,xsx,xss,microsoft xbox series x,microsoft xbox series s,xbox series x|s,microsoft xbox series,xbox series x/s,series x,series s"},
    {name: "Xbox One", description: "Microsoft Xbox One", aliases: "xbone,xb1,xbox one,microsoft xbox one,xbox one x,xbox one s,xbox one digital,microsoft xbone,microsoft xb1,xboxone"},
    {name: "Xbox 360", description: "Microsoft Xbox 360", aliases: "x360,xb360,microsoft xbox 360,xbox360,microsoft x360"},
    {name: "Xbox", description: "Microsoft Xbox (Original)", aliases: "xbox original,original xbox,microsoft xbox,xbox classic,xbox og"},
    
    // Nintendo family
    {name: "Nintendo Switch", description: "Nintendo Switch/Switch Lite/Switch OLED", aliases: "switch,ns,nx,nintendo switch lite,switch lite,switch oled,nintendo switch oled,nsw,nintendo nsw"},
    {name: "Nintendo Switch 2", description: "Nintendo Switch 2", aliases: "switch 2,ns2,nintendo switch2,switch2,nsw2,nintendo nsw2"},
    {name: "Nintendo 3DS", description: "Nintendo 3DS/2DS", aliases: "3ds,new 3ds,2ds,new 2ds,n3ds,new nintendo 3ds,nintendo 2ds"},
    {name: "Nintendo DS", description: "Nintendo DS/DS Lite/DSi", aliases: "nds,ds,ds lite,dsi,nintendo ds lite,nintendo dsi"},
    {name: "Nintendo Wii U", description: "Nintendo Wii U", aliases: "wii u,wiiu"},
    {name: "Nintendo Wii", description: "Nintendo Wii", aliases: "wii"},
    {name: "Nintendo GameCube", description: "Nintendo GameCube", aliases: "gamecube,gc,ngc,gcn,nintendo gc"},
    {name: "Game Boy Advance", description: "Nintendo Game Boy Advance", aliases: "gba,game boy advance,nintendo gba,gameboy advance"},
    {name: "Game Boy", description: "Nintendo Game Boy/Game Boy Color", aliases: "gb,gbc,game boy color,gameboy,gameboy color,nintendo game boy"},
    {name: "Nintendo 64", description: "Nintendo 64", aliases: "n64,ultra 64"},
    {name: "Super Nintendo", description: "Super Nintendo Entertainment System", aliases: "snes,super nes,super famicom,sfc,super nintendo entertainment system"},
    {name: "Nintendo Entertainment System", description: "Nintendo Entertainment System (NES)", aliases: "nes,famicom,nintendo,fc"},
    
    // Sega family
    {name: "Sega Genesis", description: "Sega Genesis/Mega Drive", aliases: "genesis,mega drive,megadrive,sega mega drive,md"},
    {name: "Sega Dreamcast", description: "Sega Dreamcast", aliases: "dreamcast,dc"},
    {name: "Sega Saturn", description: "Sega Saturn", aliases: "saturn"},
    
    // Atari
    {name: "Atari 2600", description: "Atari 2600", aliases: "atari,atari vcs,vcs"},
    
    // Mobile
    {name: "Mobile", description: "iOS/Android", aliases: "ios,android,iphone,ipad,mobile phone,smartphone,tablet"},
    
    // Physical games
    {name: "Physical Only", description: "Board games, card games, etc.", aliases: "tabletop,board game,card game"},
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
    
    // Get all user's platforms from database
    const repo = AppDataSource.getRepository(Platform);
    const platforms = await repo.find({where: {owner: {id: ownerId}}});
    
    // FIRST PASS: Check if input matches any platform name exactly (case-insensitive)
    // This ensures user-created platforms with specific names take priority over aliases
    for (const platform of platforms) {
        if (platform.name.toLowerCase() === lowercased) {
            return platform.name;
        }
    }
    
    // SECOND PASS: Check if input matches any platform's aliases
    // Only after confirming no platform has this exact name
    for (const platform of platforms) {
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
