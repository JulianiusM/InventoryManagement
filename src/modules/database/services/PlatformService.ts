import {AppDataSource} from "../dataSource";
import {Platform} from "../entities/platform/Platform";
import {v4 as uuidv4} from "uuid";

const DEFAULT_PLATFORMS = [
    {name: "PC", description: "Windows/Mac/Linux"},
    {name: "PlayStation 5", description: "Sony PlayStation 5"},
    {name: "PlayStation 4", description: "Sony PlayStation 4"},
    {name: "Xbox Series X|S", description: "Microsoft Xbox Series X|S"},
    {name: "Xbox One", description: "Microsoft Xbox One"},
    {name: "Nintendo Switch", description: "Nintendo Switch/Switch Lite/Switch OLED"},
    {name: "Mobile", description: "iOS/Android"},
    {name: "Physical Only", description: "Board games, card games, etc."},
];

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
    let platform = await getPlatformByName(name.trim(), ownerId);
    if (!platform) {
        platform = repo.create({
            id: uuidv4(),
            name: name.trim(),
            description: null,
            isDefault: false,
            owner: {id: ownerId},
        });
        await repo.save(platform);
    }
    return platform;
}
