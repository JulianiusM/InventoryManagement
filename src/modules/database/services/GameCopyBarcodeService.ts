import {AppDataSource} from '../dataSource';
import {GameCopyBarcode} from '../entities/gameCopyBarcode/GameCopyBarcode';
import {GameCopy} from '../entities/gameCopy/GameCopy';
import {BarcodeSymbology} from '../../../types/InventoryEnums';

export async function createGameCopyBarcode(code: string, gameCopyId: string | null, symbology: string = 'UNKNOWN'): Promise<GameCopyBarcode> {
    const repo = AppDataSource.getRepository(GameCopyBarcode);
    const barcode = new GameCopyBarcode();
    barcode.code = code;
    barcode.symbology = symbology as BarcodeSymbology;
    if (gameCopyId) {
        barcode.gameCopy = {id: gameCopyId} as GameCopy;
    }
    return await repo.save(barcode);
}

export async function getGameCopyBarcodeByCode(code: string): Promise<GameCopyBarcode | null> {
    const repo = AppDataSource.getRepository(GameCopyBarcode);
    return await repo.findOne({
        where: {code},
        relations: ['gameCopy', 'gameCopy.gameRelease', 'gameCopy.gameRelease.gameTitle'],
    });
}

export async function getBarcodesByGameCopyId(gameCopyId: string): Promise<GameCopyBarcode[]> {
    const repo = AppDataSource.getRepository(GameCopyBarcode);
    return await repo.find({
        where: {gameCopy: {id: gameCopyId}},
        order: {createdAt: 'DESC'},
    });
}

export async function mapBarcodeToGameCopy(code: string, gameCopyId: string, symbology: string = 'UNKNOWN'): Promise<GameCopyBarcode> {
    const repo = AppDataSource.getRepository(GameCopyBarcode);
    let barcode = await repo.findOne({where: {code}});
    
    if (barcode) {
        barcode.gameCopy = {id: gameCopyId} as GameCopy;
        return await repo.save(barcode);
    } else {
        return await createGameCopyBarcode(code, gameCopyId, symbology);
    }
}

export async function unmapBarcode(code: string): Promise<void> {
    const repo = AppDataSource.getRepository(GameCopyBarcode);
    const barcode = await repo.findOne({where: {code}});
    if (barcode) {
        barcode.gameCopy = null;
        await repo.save(barcode);
    }
}

export async function deleteGameCopyBarcode(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(GameCopyBarcode);
    await repo.delete({id});
}

export async function deleteBarcodesByGameCopyId(gameCopyId: string): Promise<void> {
    const repo = AppDataSource.getRepository(GameCopyBarcode);
    await repo.delete({gameCopy: {id: gameCopyId}});
}
