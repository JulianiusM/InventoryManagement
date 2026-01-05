// ⚠️ AUTO-GENERATED FILE — do not edit manually.
import { Barcode } from "./entities/barcode/Barcode";
import { ExternalAccount } from "./entities/externalAccount/ExternalAccount";
import { ExternalLibraryEntry } from "./entities/externalLibraryEntry/ExternalLibraryEntry";
import { GameExternalMapping } from "./entities/gameExternalMapping/GameExternalMapping";
import { GameRelease } from "./entities/gameRelease/GameRelease";
import { GameTitle } from "./entities/gameTitle/GameTitle";
import { Item } from "./entities/item/Item";
import { ItemMovement } from "./entities/itemMovement/ItemMovement";
import { Loan } from "./entities/loan/Loan";
import { Location } from "./entities/location/Location";
import { Party } from "./entities/party/Party";
import { Platform } from "./entities/platform/Platform";
import { Session } from "./entities/session/Session";
import { SyncJob } from "./entities/syncJob/SyncJob";
import { User } from "./entities/user/User";
import { CreateInventoryTables1735993200000 } from "../../migrations/1735993200000-CreateInventoryTables";
import { CreateGamesTables1736092800000 } from "../../migrations/1736092800000-CreateGamesTables";

export const entities = [Barcode, ExternalAccount, ExternalLibraryEntry, GameExternalMapping, GameRelease, GameTitle, Item, ItemMovement, Loan, Location, Party, Platform, Session, SyncJob, User];

export const migrations = [CreateInventoryTables1735993200000, CreateGamesTables1736092800000];

export const subscribers = [];
