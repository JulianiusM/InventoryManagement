// ⚠️ AUTO-GENERATED FILE — do not edit manually.
import { Barcode } from "./entities/barcode/Barcode";
import { Item } from "./entities/item/Item";
import { ItemMovement } from "./entities/itemMovement/ItemMovement";
import { Loan } from "./entities/loan/Loan";
import { Location } from "./entities/location/Location";
import { Party } from "./entities/party/Party";
import { Session } from "./entities/session/Session";
import { User } from "./entities/user/User";
import { CreateInventoryTables1735993200000 } from "../../migrations/1735993200000-CreateInventoryTables";

export const entities = [Barcode, Item, ItemMovement, Loan, Location, Party, Session, User];

export const migrations = [CreateInventoryTables1735993200000];

export const subscribers = [];
