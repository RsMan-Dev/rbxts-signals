export declare const RAW: symbol, TRACK: symbol, SELF: symbol, PROXY: symbol, RAW_TRACKED: symbol;
export declare function unwrap<T>(obj: T, untracks?: boolean): T;
export declare function trackAll(obj: object): void;
export declare function withWrap<T extends object>(obj: T): T;
export declare function withoutWrap<T extends object>(obj: T, untracked?: boolean): T;
export declare const createMutable: <T extends object>(obj: T) => T;
