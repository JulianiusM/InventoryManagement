export function deepCopy(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    // Handle Date objects
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    // Handle RegExp objects
    if (obj instanceof RegExp) {
        return new RegExp(obj.source, obj.flags);
    }

    const copied: any = Array.isArray(obj) ? [] : {};

    for (let key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            copied[key] = deepCopy(obj[key]);
        }
    }

    return copied;
}