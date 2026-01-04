export const v4 = (): string => {
    // Prefer crypto.randomUUID if present
    const g = (globalThis as any).crypto?.randomUUID?.();
    if (g) return g;
    // Fallback: generate a pseudo v4
    const rnd = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
    return `${rnd()}${rnd()}-${rnd()}-4${rnd().slice(0, 3)}-8${rnd().slice(0, 3)}-${rnd()}${rnd()}${rnd()}`;
};
export default {v4};
