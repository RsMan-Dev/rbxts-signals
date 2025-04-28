export declare const RAW: symbol, TRACK: symbol, SELF: symbol, PROXY: symbol;
export declare function unwrap<T>(obj: T): T;
export declare function withWrap<T extends object>(obj: T): T;
export declare function withoutWrap<T extends object>(obj: T): T;
export declare const createMutable: <T extends object>(obj: T) => T;
