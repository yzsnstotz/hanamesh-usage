/** Drains late asynchronous initialization, including owner unload during startup. */
export declare class OwnedResource<T> {
    private readonly shutdown;
    private starting;
    private closing;
    private closed;
    constructor(shutdown: (resource: T) => Promise<void>);
    start(factory: () => T | Promise<T>): Promise<T>;
    close(): Promise<void>;
}
