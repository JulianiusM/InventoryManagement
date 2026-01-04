import {AppDataSource} from '../dataSource';
import {Barcode} from '../entities/barcode/Barcode';
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
        relations: ['item', 'item.location'],
    });
}

export async function getBarcodeById(id: number): Promise<Barcode | null> {
    const repo = AppDataSource.getRepository(Barcode);
    return await repo.findOne({
        where: {id},
        relations: ['item'],
    });
}

export async function getBarcodesByItemId(itemId: number): Promise<Barcode[]> {
    const repo = AppDataSource.getRepository(Barcode);
    return await repo.find({
        where: {itemId},
        order: {createdAt: 'DESC'},
    });
}

export async function mapBarcodeToItem(code: string, itemId: number, symbology = 'unknown'): Promise<Barcode> {
    const repo = AppDataSource.getRepository(Barcode);
    
    // Check if barcode already exists
    let barcode = await repo.findOne({where: {code}});
    
    if (barcode) {
        // Update existing barcode to point to new item
        barcode.itemId = itemId;
        return await repo.save(barcode);
    } else {
        // Create new barcode
        return await createBarcode({code, itemId, symbology});
    }
}

export async function unmapBarcode(code: string): Promise<void> {
    const repo = AppDataSource.getRepository(Barcode);
    await repo.update({code}, {itemId: null});
}

export async function deleteBarcode(id: number): Promise<void> {
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
