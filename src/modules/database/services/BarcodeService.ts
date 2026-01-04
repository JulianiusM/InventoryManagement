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
        where: {itemId},
        order: {createdAt: 'DESC'},
    });
}

export async function mapBarcodeToItem(code: string, itemId: string, symbology = 'UNKNOWN'): Promise<Barcode> {
    const repo = AppDataSource.getRepository(Barcode);
    
    // Check if barcode already exists
    let barcode = await repo.findOne({where: {code}});
    
    if (barcode) {
        // Update existing barcode to point to new item
        barcode.item = {id: itemId} as any;
        return await repo.save(barcode);
    } else {
        // Create new barcode
        return await createBarcode({code, symbology: symbology as BarcodeSymbology, item: {id: itemId} as any});
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

/**
 * Get all unmapped barcodes (barcodes not assigned to any item)
 */
export async function getUnmappedBarcodes(): Promise<Barcode[]> {
    const repo = AppDataSource.getRepository(Barcode);
    return await repo.find({
        where: {itemId: IsNull()},
        order: {createdAt: 'DESC'},
    });
}
