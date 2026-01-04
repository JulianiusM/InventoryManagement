declare module '../package.json' {
    export const version: string;
    const value: { version: string; [k: string]: any };
    export default value;
}
