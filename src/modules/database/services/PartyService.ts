import {AppDataSource} from '../dataSource';
import {Party} from '../entities/party/Party';
import {User} from '../entities/user/User';

export async function createParty(data: {
    name: string;
    email?: string | null;
    phone?: string | null;
    ownerId: number;
}): Promise<Party> {
    const repo = AppDataSource.getRepository(Party);
    const party = new Party();
    party.name = data.name;
    party.email = data.email ?? null;
    party.phone = data.phone ?? null;
    party.owner = {id: data.ownerId} as User;
    return await repo.save(party);
}

export async function getPartyById(id: string): Promise<Party | null> {
    const repo = AppDataSource.getRepository(Party);
    return await repo.findOne({where: {id}});
}

export async function getPartyByName(name: string, ownerId: number): Promise<Party | null> {
    const repo = AppDataSource.getRepository(Party);
    return await repo.findOne({where: {name, owner: {id: ownerId}}});
}

export async function getAllParties(ownerId: number): Promise<Party[]> {
    const repo = AppDataSource.getRepository(Party);
    return await repo.find({
        where: {owner: {id: ownerId}},
        order: {name: 'ASC'},
    });
}

/**
 * Find a party by name or create if not exists
 */
export async function findOrCreateParty(
    name: string,
    email?: string | null,
    phone?: string | null,
    ownerId?: number
): Promise<Party> {
    if (!ownerId) {
        throw new Error('Owner ID is required');
    }
    const existing = await getPartyByName(name, ownerId);
    if (existing) {
        // Update email and phone if provided and different
        let updated = false;
        if (email && email !== existing.email) {
            existing.email = email;
            updated = true;
        }
        if (phone && phone !== existing.phone) {
            existing.phone = phone;
            updated = true;
        }
        if (updated) {
            const repo = AppDataSource.getRepository(Party);
            return await repo.save(existing);
        }
        return existing;
    }
    return await createParty({name, email, phone, ownerId});
}

export async function updateParty(id: string, data: Partial<Omit<Party, 'owner'>>): Promise<void> {
    const repo = AppDataSource.getRepository(Party);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function deleteParty(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Party);
    await repo.delete({id});
}
