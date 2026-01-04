/**
 * Shared TypeORM transformers for common data type conversions.
 */

import {formatAmount, toAmount} from "../lib/util";

/**
 * Currency transformer for decimal columns.
 * Converts numeric values to formatted decimal strings (2 decimal places) for database storage
 * and back to numbers for application use.
 */
export const currencyTransformer = {
    to: (value: number | string) => formatAmount(toAmount(value)),
    from: (value: string) => Number(value),
};
