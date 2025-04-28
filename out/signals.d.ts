/**
 * Custom implementation of S.js for roblox, with interfaces inspired from many other libraries like solidjs, preact, etc.
 *
 * This code is mainly not mine, the library could be created thanks to a massive inspiration from:
 *  - https://github.com/adamhaile/S
 *  - https://github.com/solidjs/solid
 *  - https://www.npmjs.com/package/@preact/signals-react
 *  - https://github.com/rodydavis/signals.dart
 *
 * The code has been rewritten to be compilable using roblox-ts, and to be more useable in roblox.
 * I included some functionalities that i foud useful in other libraries, like the on, getOwner
 * and runWithOwner from solidjs, the single-function signals style from preact, augmented with
 * other methods inspired by signals.dart.
 *
 * I removed some securities, so if any buc can be fous let me know it in a pull request or in issues.
 *
 * The library may be slower that the original S.js, but it is more flexible and easier to use, and i
 * did not found any performance issue in my tests, unless when i created a ridiculously sized tree of signals.
 */
export interface Benchmark {
    computations: number;
    reads: number;
    writes: number;
    disposes: number;
    execTime: number;
}
/**
 * # Benchmarking function
 * Benchmarks a function by running it and measuring the time taken to execute it, as well as the number of computations,
 * reads, writes and disposes that occurred during the execution.
 *
 * @param fn Function to benchmark, all computations must be synchronous, and context must not be frozen
 * @param logs Whether to log the results or not, defaults to true
 * @returns A tuple of the result of the function and a BenchmarkResult object containing the number of computations, reads, writes, disposes and execution time in milliseconds
 */
export declare function benchmark<T>(fn: () => T, logs?: boolean): [T, Benchmark];
/**
 * # Get owner
 * @returns The current running computation node owning the current context, or undefined if there is none
 */
export declare function getOwner(): ComputationNode | undefined;
/**
 * # Run with owner
 * Runs a function with a given owner, and restores the previous owner after the function is executed.
 * This is useful in asynchronous contexts where the owner will be undefined, allows to create new
 * computations owned by the given owner, to allow them to be disposed when the owner is disposed.
 *
 * @param owner The new computation node owner to define during the function execution
 * @param fn The function to execute with the new owner
 * @returns The result of the function execution
 */
export declare function runWithOwner<T>(owner: ComputationNode | undefined, fn: () => T): T;
export interface INode<T> {
    clock(): IClock;
    current: (untrack?: boolean, instantaneous?: boolean) => T;
}
/**
 * # ComputationNode class
 * Represents a computation node in the reactive system. It holds the function to be executed, its value, and its state.
 * It also manages its dependencies and cleanups.
 */
export declare class ComputationNode implements INode<unknown> {
    fn: ((v: any) => any) | undefined;
    value: any;
    age: number;
    state: number;
    source1: undefined | Log;
    source1slot: number;
    sources: undefined | Log[];
    sourceslots: undefined | number[];
    log: Log | undefined;
    owned: ComputationNode[] | undefined;
    cleanups: (((final: boolean) => void)[]) | undefined;
    context: Map<object, unknown>;
    kept: boolean;
    current: (untrack?: boolean, instantaneous?: boolean) => any;
    constructor();
    clock(): {
        time: () => number;
    };
    apply<T>(fn: () => T): T;
}
/**
 * # Get candidate node
 * Gets the last recycled node, or creates a new one if there is none.
 * This is used to create new computations nodes to provide as root for new computations.
 * @returns The current running computation node, or undefined if there is none
 */
export declare function getCandidateNode(): ComputationNode;
/**
 * # Create root
 * Will create a new computation node with the given function, and will run it immediately.
 * The node will be the base of a new computation tree, and will be disposed when the given
 * dispose function will be executed.
 * @param fn Function where the new owner will be defined, and will be executed immediately, with the given dispose function at first parameter
 * @returns The result of the function execution
 */
export declare function createRoot<T>(fn: (dispose: () => void) => T): T;
/**
 * # Make computation node
 * Creates a new computation node with the given function and initial value. The node will be owned
 * by the current owner, and will be disposed when the owner is disposed, unless orphaned.
 * The computation will be executed immediately with the initial value, and will track its dependencies, unless untracked.
 *
 * @warn Prefer using createEffect or createMemo instead of this function, as it is not meant to be used directly, exposed for more advanced use cases.
 * @warn Creating a computations without any owner will never be disposed, and will leak memory.
 * @param fn Function to execute on initialization and when any of its dependencies change, will be passed the last execution value as first parameter.
 * @param value Initial value of the computation, will be passed to the function on first execution
 * @param orphan Whether the computation is orphaned or not, if true, the computation will not be disposed when the owner is disposed
 * @param sample Whether the computation is sampled or not, if true, the computation will not track its dependencies
 * @returns
 */
export declare function createComputation<T, S>(fn: (v: S) => T, value: S, orphan: boolean, untrack: boolean): {
    node: INode<T> | undefined;
    value: T;
};
export interface IDataNode<T> extends INode<T> {
    next(value?: T): T;
    getInstantaneousValue(): T;
}
/**
 * # Make data node
 * Creates a new data node with the given value and options. The node will be owned by the current owner, and will be disposed when the owner is disposed.
 *
 * @param value The value of the data node
 * @param options The options to be passed to the data node, including the eq function
 * @returns The new data node
 */
export declare function makeDataNode<T>(value: T, options?: {
    eq?: ((a: T, b: T) => boolean) | false;
}): IDataNode<T>;
/**
 * # Make lazy data node
 * Creates a new lazy data node with the given value and options. The node will be created when it is first got using the accessor function.
 * the owner used for disposal is the one that was defined at the moment of makeLazyDataNode was called, and if it was no owner at this moment,
 * the owner used will be the one that is defined at first call of the accessor function.
 * A lazy option is provided, when false, the node will be created directly.
 *
 * @param value The accessor function to be called when the node is first accessed
 * @param options The options to be passed to the data node, including the eq function and lazy option
 * @returns An accessor function that will return the data node when called
 */
export declare function makeLazyDataNode<T>(value: T, options?: {
    eq?: ((a: T, b: T) => boolean) | false;
    lazy?: boolean;
}): () => IDataNode<T>;
export type Signal<T> = {
    (): T;
    (val: T): T;
    val: T;
    set: (fn: (val: T) => T) => T;
    peek: T;
    accessor: () => T;
};
/**
 * # Create signal
 * Makes a signal using a DataNode, with an user-friendly interface.
 * If lazy is set to true (default), the signal will be created when it is first accessed, cf: {@link makeLazyDataNode}
 *
 * @param value The first value of the signal
 * @param options The options to be passed to the signal, including the eq function and lazy option
 * @returns A signal object
 */
export declare function createSignal<T>(value: T, options?: {
    eq?: ((a: T, b: T) => boolean) | false;
    lazy?: boolean;
}): Signal<T>;
export declare function isSignal<T>(signal: unknown): signal is Signal<T>;
export type ReadonlySignal<T> = {
    (): T;
    readonly val: T;
    peek: T;
    accessor: () => T;
};
/**
 * # Make memo node
 * Like {@link makeDataNode}, will create a new data node with the given value and options, but will also create
 * a new computation node with the given function, that will update the data node anytime its dependencies change.
 *
 * @warn memo is batched, see {@link batch} for more information
 * @warn Like any computations, creating a computations without any owner will never be disposed, and will leak memory.
 * @param fn The function to be executed when any of its dependencies change, will update its signal value.
 * @param value The initial value of the memo, will be passed to the function on first execution.
 * @param options The options to be passed to the data node, including the eq function
 * @returns
 */
export declare function makeMemoNode<T>(fn: (v: T | undefined) => T, value: T | undefined, options?: {
    eq?: ((a: T, b: T) => boolean) | false;
}): IDataNode<T>;
/**
 * # Make lazy memo node
 * Like {@link makeMemoNode}, but with {@link makeLazyDataNode} behavior.
 *
 * @warn memo is batched, see {@link batch} for more information
 * @warn Like any computations, creating a computations without any owner will never be disposed, and will leak memory.
 * @param fn The function to be executed when any of its dependencies change, will update its signal value.
 * @param value The initial value of the memo, will be passed to the function on first execution.
 * @param options The options to be passed to the data node, including the eq function
 * @returns
 */
export declare function makeLazyMemoNode<T>(fn: (v: T | undefined) => T, value: T | undefined, options?: {
    eq?: ((a: T, b: T) => boolean) | false;
    lazy?: boolean;
}): () => IDataNode<T>;
/**
 * # Create Memo
 * Creates a memoized function that will be executed when any of its dependencies change.
 * The memoized will act as a computation that updates a signal value, and will be disposed when the owner is disposed.
 *
 * @warn memo is batched, see {@link batch} for more information
 * @warn Like any computations, creating a computations without any owner will never be disposed, and will leak memory.
 * @param fn The function to be executed when any of its dependencies change, will update its data node value, will get the current value of the signal as first parameter
 * @param value The initial value of the memo, will be passed to the function on first execution
 * @param options
 */
export declare function createMemo<T>(fn: (v: T | undefined) => T): ReadonlySignal<T>;
export declare function createMemo<T>(fn: (v: T) => T, value: T, options?: {
    eq?: ((a: T, b: T) => boolean) | false;
    lazy?: boolean;
}): ReadonlySignal<T>;
export declare function isReadonlySignal<T>(signal: unknown): signal is ReadonlySignal<T>;
/**
 * # Untrack
 * Disable listener during the function execution, so it won't track any dependencies. This is useful to avoid unnecessary updates
 *
 * @param fn The function to be executed without tracking
 * @returns The result of the function execution
 */
export declare function untrack<T>(fn: () => T): T;
/**
 * # Create effect
 * Creates a new effect that will be executed when any of its dependencies change. returns a function that will get the effect result.
 *
 * @warn createEffect is batched, see {@link batch} for more information
 * @warn Like any computations, creating a computations without any owner will never be disposed, and will leak memory.
 * @param fn The function to be executed when any of its dependencies change, will be passed the last execution value as first parameter
 * @param value The initial value of the effect, will be passed to the function on first execution
 * @returns A function that will get the effect result
 */
export declare function createEffect<T>(fn: (v: T | undefined) => T): () => T;
export declare function createEffect<S, T>(fn: (v: S) => T, value: S): () => T;
/**
 * # On
 * This function help to keep control of tracking, by using the first function to track dependencies, and the second one to transform
 * the first function's result, and old computation result as second parameter, in an untracked scope, returns a function to give to
 * any computation.
 * Defer option is used to wait for the first change in the first function to execute the second one, so initialisation will not
 * execute the second function if defer is true.
 *
 * @param on Tracking function, will be called to track dependencies
 * @param fn Transform function, will be called to transform the first function's result and old computation result
 * @param options Options to be passed to the function, including the defer option
 * @returns
 */
export declare function on<I, T>(on: () => I, fn: (r: I, v?: T) => T, options?: {
    defer?: boolean;
}): (old?: T) => T;
/**
 * # batch
 * Executes a function in a batch, so all changes will be applied at once, and will not trigger any updates until the batch is finished.
 * Nesting batches is allowed, but will have no more effect than a single batch.
 *
 * @note createEffect and createMemo are already batched, so this function is not needed in most cases.
 * @param fn The function to be executed in a batch
 * @returns The result of the function execution
 */
export declare function batch<T>(fn: () => T): T;
/**
 * # On cleanup
 * Adds a cleanup function to the current owner, that will be executed when the owner is disposed.
 *
 * @param fn The function to execute when the owner is disposed
 */
export declare function onCleanup(fn: (final: boolean) => void): void;
/**
 * # Dispose
 * a function to manually dispose a node, and all its dependencies.
 *
 * @param node The node to dispose
 */
export declare function disposeNode<T>(node?: INode<T>): void;
/**
 * # Is batching
 * Checks if the current context is in a batch or not, and returns true if it is.
 */
export declare function isBatching(): boolean;
/**
 * # Is listening
 * Checks if the current context is listening or not, and returns true if it is.
 */
export declare function isListening(): boolean;
/**
 * #Context class
 * Represents a context in the reactive system. It holds a value and allows to run a function with the context value.
 */
declare class Context<T> {
    value: T;
    private symbol;
    constructor(value: T);
    /**
     * # Get context value
     * Gets the current context value. If the context is not defined, it will return the default value of the context.
     * @returns The current context value, or the default value if the context is not defined
     */
    getValue(): T;
    populate(value: T): void;
    /**
     * # Run with context
     * Runs a function with the context value. The function will be executed with the context value set in the current owner.
     * @param value The value to set in the context
     * @param callback The function to execute with the context value
     * @returns The result of the function execution
     */
    apply<R>(value: T, callback: () => R, tracks?: boolean): R;
    /**
     * # Provide context
     * Provides a context value to a child component. The child component will be executed with the context value set in the current owner.
     * @param props The props of the child component, including the value to set in the context
     * @returns The result of the function execution
     */
    Provider<R>(props: {
        Children: R;
        Value: T;
    }): R;
}
/**
 * # Create context
 * Creates a new context with the given value. The context can be used to run a function with the context value.
 *
 * @param value The value of the context
 * @returns The new context
 */
export declare function createContext<T>(value: T): Context<T>;
/**
 * # Get context
 * Gets the current context value. If the context is not defined, it will return the default value of the context.
 *
 * @param context The context to get the value from
 * @returns The current context value
 */
export declare function useContext<T>(context: Context<T>): T;
/**
 * # Create cache
 * Cache a value to avoid executing the function multiple times.
 * Useful to execute a function in another context, but avoiding to execute it multiple times.
 * Cache is resettable using the second function returned.
 * @param fn Function to be executed to get the value of the cache
 * @returns A function that will return the cached value, and a function to clear the cache
 */
export declare function createCache<T>(fn: () => T): [() => T, () => void];
export interface IClock {
    time(): number;
}
declare class Log {
    node1: undefined | ComputationNode;
    node1slot: number;
    nodes: undefined | ComputationNode[];
    nodeslots: undefined | number[];
}
export {};
