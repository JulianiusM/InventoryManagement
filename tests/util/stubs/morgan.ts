export default function morgan(_fmt?: any, _opts?: any) {
    return function (_req: any, _res: any, next: any) {
        next();
    };
}
