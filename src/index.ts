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

import { withArgCount } from "./argCount";


// Because luau has no console, we use print, to keep js-like syntax
const console = {
  warn: (msg: string) => print("[WARNING]", msg),
  error: (msg: string) => print("[ERROR]", msg)
}

// Constants
const NOTPENDING = {} as symbol,
  CURRENT = 0,
  STALE = 1,
  RUNNING = 2;




export interface Benchmark { computations: number; reads: number; writes: number; disposes: number; execTime: number; }
let CurrBench: Benchmark | undefined = undefined;

/**
 * # Benchmarking function
 * Benchmarks a function by running it and measuring the time taken to execute it, as well as the number of computations,
 * reads, writes and disposes that occurred during the execution.
 * 
 * @param fn Function to benchmark, all computations must be synchronous, and context must not be frozen
 * @param logs Whether to log the results or not, defaults to true
 * @returns A tuple of the result of the function and a BenchmarkResult object containing the number of computations, reads, writes, disposes and execution time in milliseconds
 */
export function benchmark<T>(fn: () => T, logs = true): [T, Benchmark] {
  const startTime = os.clock(), oldBench = CurrBench, bench = { computations: 0, reads: 0, writes: 0, disposes: 0, execTime: 0 };
  let result: T;

  CurrBench = bench;

  try {
    result = fn();
  } finally {
    bench.execTime = (os.clock() - startTime) * 1000;
    if (oldBench !== undefined) {
      oldBench.computations += bench.computations;
      oldBench.reads += bench.reads;
      oldBench.writes += bench.writes;
      oldBench.disposes += bench.disposes;
    }
    CurrBench = oldBench;
  }

  if (logs) print(`[SIGNAL-BENCH] Time taken: ${bench.execTime}ms, Computations: ${bench.computations}, Reads: ${bench.reads}, Writes: ${bench.writes}, Disposes: ${bench.disposes}`);

  return [result, bench];
}


let Listener = undefined as ComputationNode | undefined,  // currently listening computation
  LastNode = undefined as ComputationNode | undefined,  // cached unused node, for re-use
  Owner = undefined as ComputationNode | undefined      // owner for new computations


/**
 * # Get owner
 * @returns The current running computation node owning the current context, or undefined if there is none
 */
export function getOwner() {
  const owner = Owner;
  // prevent recycling the node bc can be used in async gaps.
  if (owner !== undefined && owner.kept === false) {
    owner.kept = true;
    const clean = () => owner.kept = false
    if (owner.cleanups !== undefined) owner.cleanups[owner.cleanups.size()] = clean;
    else owner.cleanups = [clean];
  }
  return owner;
}


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
export function runWithOwner<T>(owner: ComputationNode | undefined, fn: () => T) {
  const prevOwner = Owner;
  Owner = owner;
  try {
    return fn();
  } finally {
    Owner = prevOwner;
  }
}


export interface INode<T> {
  clock(): IClock;
  current(untrack?: boolean): T;
}


/**
 * # ComputationNode class
 * Represents a computation node in the reactive system. It holds the function to be executed, its value, and its state.
 * It also manages its dependencies and cleanups.
 */
export class ComputationNode implements INode<unknown> {
  fn = undefined as ((v: any) => any) | undefined;
  value = undefined as any;
  age = -1
  state = CURRENT;
  source1 = undefined as undefined | Log;
  source1slot = 0;
  sources = undefined as undefined | Log[];
  sourceslots = undefined as undefined | number[];
  log = undefined as Log | undefined;
  owned = undefined as ComputationNode[] | undefined;
  cleanups = undefined as (((final: boolean) => void)[]) | undefined;
  context = new Map<object, unknown>();
  kept = false; // if true, the node will not be be recycled and will be kept like he had dependencies, used for kept state in async gaps

  constructor() {
  }

  current() {
    if (Listener !== undefined) {
      if (this.age === RootClock.time) {
        if (this.state === RUNNING) throw "circular dependency";
        else updateNode(this); // checks for state === STALE internally, so don't need to check here
      }
      logComputationRead(this);
    }

    return this.value;
  }

  clock() {
    return RootClockProxy;
  }

  apply<T>(fn: () => T) {
    return runWithOwner(this, fn);
  }
}


const UNOWNED = new ComputationNode();


/**
 * # Get candidate node
 * Gets the last recycled node, or creates a new one if there is none.
 * This is used to create new computations nodes to provide as root for new computations.
 * @returns The current running computation node, or undefined if there is none
 */
export function getCandidateNode() {
  let node = LastNode;
  if (node === undefined) node = new ComputationNode();
  LastNode = undefined;

  if (Owner && Owner.context.size() > 0) {
    Owner.context.forEach((v, k) => node.context.set(k, v))
  }

  return node;
}


/**
 * # Create root
 * Will create a new computation node with the given function, and will run it immediately.
 * The node will be the base of a new computation tree, and will be disposed when the given
 * dispose function will be executed.
 * @param fn Function where the new owner will be defined, and will be executed immediately, with the given dispose function at first parameter
 * @returns The result of the function execution
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  let root = getCandidateNode(), result: T;
  const owner = Owner,
    disposer = () => root === undefined
      ? undefined : RunningClock !== undefined
        ? RootClock.disposes.add(root) : dispose(root);

  Owner = root;

  try {
    result = fn(disposer);
  } finally {
    Owner = owner;
  }

  if (recycleOrClaimNode(root, undefined as any, undefined, true)) root = undefined!;

  return result;
}


const createComputationResult = { node: undefined as undefined | ComputationNode, value: undefined as any };
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
export function createComputation<T, S>(fn: (v: S) => T, value: S, orphan: boolean, untrack: boolean): { node: INode<T> | undefined, value: T }
export function createComputation<T>(fn: (v: T | undefined) => T, value: T | undefined, orphan: boolean, untrack: boolean): {
  node: INode<T> | undefined, value: T
} {
  if (Owner === undefined) console.warn("computations created without a root or parent will never be disposed");

  const node = getCandidateNode(),
    owner = Owner,
    listener = Listener,
    toplevel = RunningClock === undefined;

  Owner = node;
  Listener = untrack ? undefined : node;

  value = toplevel ? execToplevelComputation(fn, value) : fn(value);

  Owner = owner;
  Listener = listener;

  const recycled = recycleOrClaimNode(node, fn, value, orphan);

  if (toplevel) finishToplevelComputation(owner, listener);

  createComputationResult.node = recycled ? undefined : node;
  createComputationResult.value = value!;

  return createComputationResult;
}


export interface IDataNode<T> extends INode<T> {
  next(value?: T): T;
  getInstantaneousValue(): T;
}


/**
 * # DataNode class
 * Represents a data node in the reactive system. It holds the value of the node, its state, and its dependencies.
 * It also manages its cleanups and updates.
 */
class DataNode implements IDataNode<unknown> {
  pending = NOTPENDING as unknown;
  log = undefined as Log | undefined;

  constructor(
    public value: unknown,
    public signalPredicate = true as ((a: unknown, b: unknown) => boolean) | boolean
  ) { }

  getInstantaneousValue() {
    if (this.pending === NOTPENDING) return this.value;
    else return this.pending;
  }

  shouldUpdate(a: unknown, b: unknown) {
    if (this.signalPredicate === false) return true;
    if (this.signalPredicate === true) return a !== b;
    return !this.signalPredicate(a, b);
  }

  current(untrack = false) {
    if (!untrack && Listener !== undefined) logDataRead(this);
    if (CurrBench !== undefined) CurrBench.reads++;
    return this.value;
  }

  next(value: unknown) {
    if (!this.shouldUpdate(this.pending === NOTPENDING ? this.value : this.pending, value)) return value!;

    if (RunningClock !== undefined) {
      const notPending = this.pending === NOTPENDING;
      this.pending = value;
      if (notPending) RootClock.changes.add(this);
    } else { // not batching, respond to change now
      if (this.log !== undefined) {
        this.pending = value;
        RootClock.changes.add(this);
        event();
      } else {
        if (CurrBench !== undefined) CurrBench.writes++;
        this.value = value;
      }
    }
    return value!;
  }

  clock() {
    return RootClockProxy;
  }
}


/**
 * # Make data node
 * Creates a new data node with the given value and options. The node will be owned by the current owner, and will be disposed when the owner is disposed.
 * 
 * @param value The value of the data node
 * @param options The options to be passed to the data node, including the eq function
 * @returns The new data node
 */
export function makeDataNode<T>(value: T, options?: { eq?: ((a: T, b: T) => boolean) | false }) {
  return new DataNode(value, (options?.eq ?? true) as ((a: unknown, b: unknown) => boolean) | boolean) as unknown as IDataNode<T>
}


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
export function makeLazyDataNode<T>(value: T, options?: { eq?: ((a: T, b: T) => boolean) | false, lazy?: boolean }) {
  let node = options?.lazy ?? true ? undefined : makeDataNode(value, options);
  const owner = Owner;
  return () => node ??= runWithOwner(owner ?? Owner, () => makeDataNode(value, options));
}


export type Signal<T> = {
  (): T;
  (val: T): T;
  val: T;
  set: (fn: (val: T) => T) => T;
  peek: T;
  accessor: () => T;
}

/**
 * # Create signal
 * Makes a signal using a DataNode, with an user-friendly interface.
 * If lazy is set to true (default), the signal will be created when it is first accessed, cf: {@link makeLazyDataNode}
 * 
 * @param value The first value of the signal
 * @param options The options to be passed to the signal, including the eq function and lazy option
 * @returns A signal object
 */
export function createSignal<T>(value: T, options?: { eq?: ((a: T, b: T) => boolean) | false, lazy?: boolean }) {
  let node = makeLazyDataNode(value, options);

  return setmetatable({
    SIGNAL: true, // say the signal is mutable
  } as unknown as Signal<T>, {
    __call: withArgCount((argCount, _, value) => {
      if (argCount === 1) return node().current();
      else return node().next(value as T);
    }),
    __index: (target, key) => {
      if (key === "val") return node().current();
      else if (key === "set") return (fn: (val: T) => T) => {
        return node().next(fn(node().getInstantaneousValue()));
      };
      else if (key === "peek") return node().current(true);
      else if (key === "accessor") return () => node().current();

      return target[key as keyof typeof target]; // allow to access the signal object properties
    },
    __newindex: (_, key: unknown, value: unknown) => {
      if (key === "val") node().next(value as T);
    },
    __metatable: undefined,
  });
}

export function isSignal<T>(signal: unknown): signal is Signal<T> {
  return typeIs(signal, "table") && signal["SIGNAL" as keyof typeof signal] === true;
}


export type ReadonlySignal<T> = {
  (): T;
  readonly val: T;
  peek: T;
  accessor: () => T;
}


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
export function makeMemoNode<T>(fn: (v: T | undefined) => T, value: T | undefined, options?: { eq?: ((a: T, b: T) => boolean) | false }): IDataNode<T> {
  let dataNode: IDataNode<T> | undefined;

  const computationNode = createComputation<T, T | undefined>((V?: T) => {
    const newVal = batch(() => fn(V))
    if (dataNode) dataNode.next(newVal);
    return newVal;
  }, value, false, false);

  dataNode = makeDataNode(computationNode.value, options)

  return dataNode
}


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
export function makeLazyMemoNode<T>(fn: (v: T | undefined) => T, value: T | undefined, options?: { eq?: ((a: T, b: T) => boolean) | false, lazy?: boolean }) {
  let dataNode = options?.lazy ?? true ? undefined : makeMemoNode(fn, value, options);
  const owner = Owner;
  return () => dataNode ??= runWithOwner(owner ?? Owner, () => makeMemoNode(fn, value, options));
}


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
export function createMemo<T>(fn: (v: T | undefined) => T): ReadonlySignal<T>
export function createMemo<T>(fn: (v: T) => T, value: T, options?: { eq?: ((a: T, b: T) => boolean) | false, lazy?: boolean }): ReadonlySignal<T>
export function createMemo<T>(fn: (v: T | undefined) => T, value?: T, options?: { eq?: ((a: T, b: T) => boolean) | false, lazy?: boolean }): ReadonlySignal<T> {
  let node = makeLazyMemoNode(fn, value, options);

  return setmetatable({
    SIGNAL: false, // say the signal is immutable
  } as unknown as ReadonlySignal<T>, {
    __call: () => node().current(),
    __index: (target, key) => {
      if (key === "val") return node().current();
      else if (key === "peek") return untrack(() => node().current());
      else if (key === "accessor") return () => node().current();

      return target[key as keyof typeof target]; // allow to access the signal object properties
    },
    __newindex: (_, key: unknown, value: unknown) => {
      if (key === "val") node().next(value as T);
    },
    __metatable: undefined,
  });
}

export function isReadonlySignal<T>(signal: unknown): signal is ReadonlySignal<T> {
  if (!typeIs(signal, "table")) return false;
  const is = signal["SIGNAL" as keyof typeof signal];
  return is === false || is === true;
}


/**
 * # Untrack
 * Disable listener during the function execution, so it won't track any dependencies. This is useful to avoid unnecessary updates
 * 
 * @param fn The function to be executed without tracking
 * @returns The result of the function execution
 */
export function untrack<T>(fn: () => T) {
  let result: T;
  const listener = Listener;

  Listener = undefined;
  result = fn();
  Listener = listener;

  return result;
}

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
export function createEffect<T>(fn: (v: T | undefined) => T): () => T
export function createEffect<S, T>(fn: (v: S) => T, value: S): () => T
export function createEffect<T>(fn: (v: T | undefined) => T, value?: T) {
  const { node, value: _value } = createComputation(fn, value, false, false);
  return node === undefined ? () => _value : () => node!.current();
}

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
export function on<I, T>(on: () => I, fn: (r: I, v?: T) => T, options?: { defer?: boolean }) {
  let onchanges = options !== undefined ? options.defer === true : false;
  return (old?: T) => {
    const listener = Listener, input = on();
    if (onchanges) {
      onchanges = false
      return undefined as T
    } else {
      Listener = undefined;
      const value = fn(input, old)!;
      Listener = listener;
      return value
    }
  }
}


/**
 * # batch
 * Executes a function in a batch, so all changes will be applied at once, and will not trigger any updates until the batch is finished.
 * Nesting batches is allowed, but will have no more effect than a single batch.
 * 
 * @note createEffect and createMemo are already batched, so this function is not needed in most cases.
 * @param fn The function to be executed in a batch
 * @returns The result of the function execution
 */
export function batch<T>(fn: () => T) {
  let result: T = undefined!;

  if (RunningClock !== undefined) result = fn();
  else {
    RunningClock = RootClock;
    RunningClock.changes.reset();

    try {
      result = fn();
      event();
    } finally {
      RunningClock = undefined;
    }
  }

  return result;
}


/**
 * # On cleanup
 * Adds a cleanup function to the current owner, that will be executed when the owner is disposed.
 * 
 * @param fn The function to execute when the owner is disposed 
 */
export function onCleanup(fn: (final: boolean) => void) {
  if (Owner === undefined) console.warn("cleanups created without a root or parent will never be run");
  else if (Owner.cleanups === undefined) Owner.cleanups = [fn];
  else Owner.cleanups[Owner.cleanups.size()] = fn;
}


/**
 * # Dispose
 * a function to manually dispose a node, and all its dependencies.
 * 
 * @param node The node to dispose
 */
export function disposeNode<T>(node?: INode<T>) {
  if (node === undefined) return;
  if (RunningClock !== undefined) RootClock.disposes.add(node as ComputationNode);
  else dispose(node as ComputationNode);
}


/**
 * # Is batching
 * Checks if the current context is in a batch or not, and returns true if it is.
 */
export function isBatching() { return RunningClock !== undefined }


/**
 * # Is listening
 * Checks if the current context is listening or not, and returns true if it is.
 */
export function isListening() { return Listener !== undefined }


/**
 * #Context class
 * Represents a context in the reactive system. It holds a value and allows to run a function with the context value.
 */
class Context<T> {
  private symbol: object;

  constructor(public value: T) {
    this.symbol = {};
  }


  /**
   * # Get context value
   * Gets the current context value. If the context is not defined, it will return the default value of the context.
   * @returns The current context value, or the default value if the context is not defined
   */
  getValue() {
    return Owner?.context.get(this.symbol) as T ?? this.value;
  }

  populate(value: T) {
    if (Owner !== undefined) Owner.context.set(this.symbol, value);
  }

  /**
   * # Run with context
   * Runs a function with the context value. The function will be executed with the context value set in the current owner.
   * @param value The value to set in the context
   * @param callback The function to execute with the context value
   * @returns The result of the function execution
   */
  apply<R>(value: T, callback: () => R, tracks = false) {
    const { value: _value } = createComputation(() => {
      this.populate(value);
      return callback();
    }, undefined, false, !tracks);
    return _value;
  }


  /**
   * # Provide context
   * Provides a context value to a child component. The child component will be executed with the context value set in the current owner.
   * @param props The props of the child component, including the value to set in the context
   * @returns The result of the function execution
   */
  Provider<R>(props: { children: R, value: T }) {
    return this.apply(props.value, () => props.children);
  }
}


/**
 * # Create context
 * Creates a new context with the given value. The context can be used to run a function with the context value.
 * 
 * @param value The value of the context
 * @returns The new context
 */
export function createContext<T>(value: T) {
  return new Context(value);
}


/**
 * # Get context
 * Gets the current context value. If the context is not defined, it will return the default value of the context.
 * 
 * @param context The context to get the value from
 * @returns The current context value
 */
export function useContext<T>(context: Context<T>) {
  return context.getValue();
}

/**
 * # Create cache
 * Cache a value to avoid executing the function multiple times.
 * Useful to execute a function in another context, but avoiding to execute it multiple times.
 * Cache is resettable using the second function returned.
 * @param fn Function to be executed to get the value of the cache
 * @returns A function that will return the cached value, and a function to clear the cache
 */
export function createCache<T>(fn: () => T) {
  let value = undefined as T | undefined;
  const cache = () => {
    if (value === undefined) value = fn();
    return value;
  };
  onCleanup(() => value = undefined)
  return [cache, () => { value = undefined }] as [() => T, () => void];
}

export interface IClock {
  time(): number;
}


/// Graph classes and operations
class Log {
  node1 = undefined as undefined | ComputationNode;
  node1slot = 0;
  nodes = undefined as undefined | ComputationNode[];
  nodeslots = undefined as undefined | number[];
}

class Queue<T> {
  items = [] as T[];
  count = 0;

  reset() {
    this.count = 0;
  }

  add(item: T) {
    this.items[this.count] = item;
    this.count++
  }

  run(fn: (item: T) => void) {
    const items = this.items;
    for (const item of items) fn(item!);
    items.clear();
    this.count = 0;
  }
}

class Clock {
  time = 0;

  changes = new Queue<DataNode>(); // batched changes to data nodes
  updates = new Queue<ComputationNode>(); // computations to update
  disposes = new Queue<ComputationNode>(); // disposals to run after current batch of updates finishes
}


let RootClock = new Clock(),
  RunningClock = undefined as Clock | undefined // currently running clock 


const RootClockProxy = {
  time: function () { return RootClock.time; }
};



function execToplevelComputation<T>(fn: (v: T | undefined) => T, _value: T | undefined) {
  RunningClock = RootClock;
  RootClock.changes.reset();
  RootClock.updates.reset();
  let value = undefined as T;

  try {
    value = fn(_value);
  } finally {
    Owner = Listener = RunningClock = undefined;
  }
  return value;
}

function finishToplevelComputation(owner: ComputationNode | undefined, listener: ComputationNode | undefined) {
  if (RootClock.changes.count > 0 || RootClock.updates.count > 0) {
    RootClock.time++;
    try {
      run(RootClock);
    } finally {
      RunningClock = undefined;
      Owner = owner;
      Listener = listener;
    }
  }
}



function recycleOrClaimNode<T>(node: ComputationNode, fn: (v: T | undefined) => T, value: T, orphan: boolean) {
  const _owner = orphan || Owner === undefined || Owner === UNOWNED ? undefined : Owner,
    recycle = node.kept === false && node.source1 === undefined && (node.owned === undefined && node.cleanups === undefined || _owner !== undefined);

  if (recycle) {
    LastNode = node;

    if (_owner !== undefined) {
      if (node.owned !== undefined) {
        if (_owner.owned === undefined) _owner.owned = node.owned;
        else for (const ownedNode of node.owned) _owner.owned[_owner.owned.size()] = ownedNode;
      }

      if (node.cleanups !== undefined) {
        if (_owner.cleanups === undefined) _owner.cleanups = node.cleanups;
        else for (const cleanup of node.cleanups) _owner.cleanups[_owner.cleanups.size()] = cleanup;
      }

      node.owned = node.cleanups = undefined;
      node.context.clear();
    }
  } else {
    node.fn = fn;
    node.value = value;
    node.age = RootClock.time;

    if (_owner !== undefined) {
      if (_owner.owned === undefined) _owner.owned = [node];
      else _owner.owned[_owner.owned.size()] = node;
    }
  }

  return recycle;
}

function logRead(from: Log) {
  const to = Listener!,
    toslot = to.source1 === undefined ? -1 : to.sources === undefined ? 0 : to.sources.size();
  let fromslot: number;

  if (from.node1 === undefined) {
    from.node1 = to;
    from.node1slot = toslot;
    fromslot = -1;
  } else if (from.nodes === undefined) {
    from.nodes = [to];
    from.nodeslots = [toslot];
    fromslot = 0;
  } else {
    fromslot = from.nodes.size();
    from.nodes[fromslot] = to;
    from.nodeslots![from.nodeslots!.size()] = toslot;
  }

  if (to.source1 === undefined) {
    to.source1 = from;
    to.source1slot = fromslot;
  } else if (to.sources === undefined) {
    to.sources = [from];
    to.sourceslots = [fromslot];
  } else {
    to.sources![to.sources.size()] = from;
    to.sourceslots![to.sourceslots!.size()] = fromslot;
  }
}

function logDataRead(data: DataNode) {
  data.log ??= new Log();
  logRead(data.log);
}

function logComputationRead(node: ComputationNode) {
  node.log ??= new Log();
  logRead(node.log);
}

function event() {
  // b/c we might be under a top level S.root(), have to preserve current root
  const owner = Owner;
  RootClock.updates.reset();
  RootClock.time++;
  try {
    run(RootClock);
  } finally {
    RunningClock = Listener = undefined;
    Owner = owner;
  }
}

function run(clock: Clock) {
  const running = RunningClock;
  let count = 0;

  RunningClock = clock;

  clock.disposes.reset();

  // for each batch ...
  while (clock.changes.count !== 0 || clock.updates.count !== 0 || clock.disposes.count !== 0) {
    if (count > 0) // don't tick on first run, or else we expire already scheduled updates
      clock.time++;

    clock.changes.run(applyDataChange);
    clock.updates.run(updateNode);
    clock.disposes.run(dispose);

    // if there are still changes after excessive batches, assume runaway            
    if (++count > 1e5) throw "Runaway clock detected";
  }

  RunningClock = running;
}

function applyDataChange(data: DataNode) {
  if (CurrBench !== undefined) CurrBench.writes++;
  data.value = data.pending;
  data.pending = NOTPENDING;
  if (data.log) markComputationsStale(data.log);
}

function markComputationsStale(log: Log) {
  const node1 = log.node1,
    nodes = log.nodes;

  // mark all downstream nodes stale which haven't been already
  if (node1 !== undefined) markNodeStale(node1);
  if (nodes !== undefined) for (const node of nodes) markNodeStale(node);
}

function markNodeStale(node: ComputationNode) {
  const time = RootClock.time;
  if (node.age < time) {
    node.age = time;
    node.state = STALE;
    RootClock.updates.add(node);
    if (node.owned !== undefined) markOwnedNodesForDisposal(node.owned);
    if (node.log !== undefined) markComputationsStale(node.log);
  }
}

function markOwnedNodesForDisposal(owned: ComputationNode[]) {
  for (const node of owned) {
    node.age = RootClock.time;
    node.state = CURRENT;
    if (node.owned !== undefined) markOwnedNodesForDisposal(node.owned);
  }
}

function updateNode(node: ComputationNode) {
  if (node.state === STALE) {
    const owner = Owner, listener = Listener;

    Owner = Listener = node;

    node.state = RUNNING;
    cleanupNode(node, false);
    if (CurrBench !== undefined) CurrBench.computations++;
    node.value = node.fn!(node.value);
    node.state = CURRENT;

    Owner = owner;
    Listener = listener;
  }
}

function cleanupNode(node: ComputationNode, final: boolean) {
  const sourceslots = node.sourceslots;

  if (node.cleanups !== undefined) {
    for (const cleanup of node.cleanups) cleanup(final);
    node.cleanups = undefined;
  }

  if (node.owned !== undefined) {
    for (const ownedNode of node.owned) dispose(ownedNode);
    node.owned = undefined;
  }

  if (node.source1 !== undefined) {
    cleanupSource(node.source1, node.source1slot);
    node.source1 = undefined;
  }

  if (node.sources !== undefined && sourceslots !== undefined) {
    for (let i = 0; i < node.sources.size(); i++) {
      cleanupSource(node.sources!.pop()!, sourceslots!.pop()!);
    }
  }
}

function cleanupSource(source: Log, slot: number) {
  if (slot === -1) source.node1 = undefined;
  else {
    const last = source.nodes![source.nodes!.size() - 1]
    const lastslot = source.nodeslots![source.nodeslots!.size() - 1];
    source.nodes![source.nodes!.size() - 1] = undefined as unknown as ComputationNode;
    source.nodeslots![source.nodeslots!.size() - 1] = undefined as unknown as number;
    if (slot !== source.nodes!.size()) {
      source.nodes![slot] = last;
      source.nodeslots![slot] = lastslot;
      if (lastslot === -1) last.source1slot = slot;
      else last.sourceslots![lastslot] = slot;
    }
  }
}

function dispose(node: ComputationNode) {
  node.fn = undefined;
  node.log = undefined;
  cleanupNode(node, true);
  if (CurrBench !== undefined) CurrBench.disposes++;
}