import {AppDataSource} from '../dataSource';
import {Party} from '../entities/party/Party';

export async function createParty(data: Partial<Party>): Promise<Party> {
    const repo = AppDataSource.getRepository(Party);
    const party = repo.create(data);
    return await repo.save(party);
}

export async function getPartyById(id: number): Promise<Party | null> {
    const repo = AppDataSource.getRepository(Party);
    return await repo.findOne({where: {id}});
}

export async function getPartyByName(name: string, ownerId?: number): Promise<Party | null> {
    const repo = AppDataSource.getRepository(Party);
    const where: { name: string; ownerId?: number } = {name};
    if (ownerId !== undefined) {
        where.ownerId = ownerId;
    }
    return await repo.findOne({where});
}

export async function getAllParties(ownerId?: number): Promise<Party[]> {
    const repo = AppDataSource.getRepository(Party);
    const where: { ownerId?: number } = {};
    if (ownerId !== undefined) {
        where.ownerId = ownerId;
    }
    return await repo.find({
        where,
        order: {name: 'ASC'},
    });
}

/**
 * Find a party by name or create if not exists
 */
export async function findOrCreateParty(
    name: string,
    email?: string | null,
    ownerId?: number
): Promise<Party> {
    const existing = await getPartyByName(name, ownerId);
    if (existing) {
        // Update email if provided and different
        if (email && email !== existing.email) {
            existing.email = email;
            const repo = AppDataSource.getRepository(Party);
            return await repo.save(existing);
        }
        return existing;
    }
    return await createParty({name, email, ownerId});
}

export async function updateParty(id: number, data: Partial<Party>): Promise<void> {
    const repo = AppDataSource.getRepository(Party);
    await repo.update({id}, data);
}

export async function deleteParty(id: number): Promise<void> {
    const repo = AppDataSource.getRepository(Party);
    await repo.delete({id});
}
