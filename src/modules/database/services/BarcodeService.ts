import {AppDataSource} from '../dataSource';
import {Barcode} from '../entities/barcode/Barcode';
import {BarcodeSymbology} from '../../../types/InventoryEnums';
import {IsNull} from 'typeorm';

export async function createBarcode(data: Partial<Barcode>): Promise<Barcode> {
    const repo = AppDataSource.getRepository(Barcode);
    const barcode = repo.create(data);
    return await repo.save(barcode);
}

export async function getBarcodeByCode(code: string): Promise<Barcode | null> {
    const repo = AppDataSource.getRepository(Barcode);
    return await repo.findOne({
        where: {code},
        relations: ['item', 'item.location', 'item.owner'],
    });
}

export async function getBarcodeById(id: string): Promise<Barcode | null> {
    const repo = AppDataSource.getRepository(Barcode);
    return await repo.findOne({
        where: {id},
        relations: ['item'],
    });
}

export async function getBarcodesByItemId(itemId: string): Promise<Barcode[]> {
    const repo = AppDataSource.getRepository(Barcode);
    return await repo.find({
        where: {item: {id: itemId}},
        order: {createdAt: 'DESC'},
    });
}

export async function mapBarcodeToItem(code: string, itemId: string, symbology = 'UNKNOWN'): Promise<Barcode> {
    const repo = AppDataSource.getRepository(Barcode);
    
    // Check if barcode already exists
    let barcode = await repo.findOne({where: {code}});
    
    if (barcode) {
        // Update existing barcode to point to new item using query builder
        await repo.createQueryBuilder()
            .update(Barcode)
            .set({item: () => `:itemId`})
            .setParameters({itemId})
            .where('id = :id', {id: barcode.id})
            .execute();
        // Reload to get the updated barcode with relations
        return (await repo.findOne({where: {id: barcode.id}, relations: ['item']}))!;
    } else {
        // Create new barcode - use update after create
        const newBarcode = repo.create({code, symbology: symbology as BarcodeSymbology});
        await repo.save(newBarcode);
        // Link to item using direct update
        await repo.createQueryBuilder()
            .update(Barcode)
            .set({item: () => `:itemId`})
            .setParameters({itemId})
            .where('id = :id', {id: newBarcode.id})
            .execute();
        return (await repo.findOne({where: {id: newBarcode.id}, relations: ['item']}))!;
    }
}

export async function unmapBarcode(code: string): Promise<void> {
    const repo = AppDataSource.getRepository(Barcode);
    const barcode = await repo.findOne({where: {code}});
    if (barcode) {
        barcode.item = null;
        await repo.save(barcode);
    }
}

export async function deleteBarcode(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Barcode);
    await repo.delete({id});
}

export async function deleteBarcodesByItemId(itemId: string): Promise<void> {
    const repo = AppDataSource.getRepository(Barcode);
    await repo.delete({item: {id: itemId}});
}

/**
 * Get all unmapped barcodes (barcodes not assigned to any item)
 */
export async function getUnmappedBarcodes(): Promise<Barcode[]> {
    const repo = AppDataSource.getRepository(Barcode);
    return await repo.find({
        where: {item: IsNull()},
        order: {createdAt: 'DESC'},
    });
}
