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

// Games module enums

export enum GameType {
    VIDEO_GAME = 'video_game',
    BOARD_GAME = 'board_game',
    CARD_GAME = 'card_game',
    TABLETOP_RPG = 'tabletop_rpg',
    OTHER_PHYSICAL_GAME = 'other_physical_game',
}

export enum GamePlatform {
    PC = 'pc',
    PS5 = 'ps5',
    PS4 = 'ps4',
    XBOX_SERIES = 'xbox_series',
    XBOX_ONE = 'xbox_one',
    SWITCH = 'switch',
    MOBILE = 'mobile',
    PHYSICAL_ONLY = 'physical_only',
    OTHER = 'other',
}

export enum GameCopyType {
    DIGITAL_LICENSE = 'digital_license',
    PHYSICAL_COPY = 'physical_copy',
}

export enum GameProvider {
    STEAM = 'steam',
    EPIC = 'epic',
    GOG = 'gog',
    XBOX = 'xbox',
    PLAYSTATION = 'playstation',
    NINTENDO = 'nintendo',
    ORIGIN = 'origin',
    UBISOFT = 'ubisoft',
    OTHER = 'other',
}

export enum ConnectorCapability {
    LIBRARY_SYNC = 'library_sync',
    PLAYTIME_SYNC = 'playtime_sync',
    INSTALLED_SYNC = 'installed_sync',
    IMPORT_FILE = 'import_file',
}

export enum SyncStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
}

export enum MappingStatus {
    PENDING = 'pending',
    MAPPED = 'mapped',
    IGNORED = 'ignored',
}
