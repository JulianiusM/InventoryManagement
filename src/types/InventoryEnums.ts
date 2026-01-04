/**
 * Enum types for inventory management entities
 */

export enum BarcodeSymbology {
    EAN13 = 'EAN13',
    EAN8 = 'EAN8',
    UPC_A = 'UPC_A',
    UPC_E = 'UPC_E',
    QR = 'QR',
    CODE128 = 'CODE128',
    CODE39 = 'CODE39',
    UNKNOWN = 'UNKNOWN',
}

export enum ItemType {
    BOOK = 'book',
    TOOL = 'tool',
    GAME = 'game',
    ELECTRONICS = 'electronics',
    CLOTHING = 'clothing',
    COLLECTIBLE = 'collectible',
    OTHER = 'other',
}

export enum ItemCondition {
    NEW = 'new',
    LIKE_NEW = 'like_new',
    GOOD = 'good',
    FAIR = 'fair',
    POOR = 'poor',
}

export enum LocationKind {
    ROOM = 'room',
    SHELF = 'shelf',
    BOX = 'box',
    BIN = 'bin',
    DRAWER = 'drawer',
    CABINET = 'cabinet',
    OTHER = 'other',
}

export enum LoanDirection {
    LEND = 'lend',      // You lent to someone
    BORROW = 'borrow',  // You borrowed from someone
}

export enum LoanStatus {
    ACTIVE = 'active',
    RETURNED = 'returned',
    OVERDUE = 'overdue',
}
