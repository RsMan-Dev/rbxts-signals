# @rbxts/signal Library

 This library is a custom implementation of a reactive system inspired by various libraries like S.js, SolidJS, Preact Signals, and Signals.dart. It is designed to work with Roblox using `roblox-ts` and provides a flexible and efficient way to manage reactive state and computations.

> This code is mainly not mine, the library could be created thanks to a massive inspiration from:
>  - https://github.com/adamhaile/S
>  - https://github.com/solidjs/solid
>  - https://www.npmjs.com/package/@preact/signals-react
>  - https://github.com/rodydavis/signals.dart

The code has been rewritten from S.js to be compilable using roblox-ts, and to be more useable in roblox.
I included some functionalities that i foud useful in other libraries, like the on, getOwner 
and runWithOwner from solidjs, the single-function signals style from preact, augmented with 
other methods inspired by signals.dart.

I removed some securities, so if any bug can be found, let me know it in a pull request or in issues.
 
The library may be slower that the original S.js, but it is more flexible and easier to use, and i 
did not found any performance issue in my tests, unless when i created a ridiculously sized tree of signals.

## Key Concepts

### Signals
Signals are reactive primitives that hold a value and notify subscribers when the value changes. They are the foundation of the reactive system.

### Owners
Owners are the context in which computations are executed. They manage the lifecycle of computations and their dependencies.

### Computations
Computations are functions that depend on signals. They automatically re-run when their dependencies change, allowing for reactive updates.
Computations can be nested and will track only their direct dependencies.
When a computations re-run, all its dependencies are disposed before re-running the function.

### Batching
Batching allows multiple signal updates to be processed together, reducing unnecessary recomputations and improving performance.<br>
A batch freezes the updates, so signals are only updated when batching is finished.

---

## Installation


---

## Usage

### createRoot
The `createRoot` function creates a new owner and runs a function within that owner. in that function is passed dispose function as argument, which can be used to dispose the owner and all its computations. It returns the result of the function.

> Warning: <br> unlike all other functions, that manipulate owner, createRoot does not auto-dispose when its parent owner is disposed. if you want to dispose automatically, pass its dispose in onDispose

```ts
function createRoot<T>(fn: (dispose: () => void) => T): T;
```
Usage:
```ts
let dispose: Owner | undefined
createRoot((disposeFn) => {
  dispose = disposeFn;
  const count = createSignal(0);
  const doubleCount = createMemo(() => count() * 2);
  createEffect(() => print(doubleCount.val)); // prints 0
  count.val++ // prints 2
  onDispose(() => print("dispose called")); // prints "dispose called"
});
dispose?.(); // prints "dispose called"
// if you want automatic dispose, use onDispose
onDispose(() => dispose?.());
```


### createEffect
The `createEffect` function creates a new computation that runs whenever its dependencies change. It takes a function as an argument and returns a the node computation result as a getter function (the result is not memoized, so uding it will cause a refresh of its dependents on every run).
>Warning: <br>
>The computation result is not memoized.<br>
>Any computation made outside an owner will never be disposed, causing memory leaks.<br>

>Note:<br>
>Effects are batched, no need to use batch() inside an effect.

```ts
function createEffect<T>(
  fn: (value: T | undefined) => T,
  value?: T
): () => T;
```


### createSignal
The `createSignal` function creates a new signal with an initial value. A `Signal` object is returned:
If lazy is set to true, the signal will not be initialized until it is accessed for the first time, true by default.
If eq is not set, signal will trigger its computations only when the value is different from the previous one.
If eq is set to false, signal will trigger its computations every time the value is set.
If eq is set to a function, the signal will trigger its computations only when the function returns true.
 
```ts
function createSignal<T>(
  value: T, 
  options?: { 
    eq?: ((a: T, b: T) => boolean) | false, 
    lazy?: boolean 
  }
): Signal<T>;

type Signal<T> = {
  (): T;
  (val: T): T;
  val: T;
  set: (fn: (val: T) => T) => T;
  peek: T;
  accessor: () => T;
}
```

When the signal is used in any computation, it will automatically be tracked, and the computation will re-run when the signal's value changes.
Usage:
```ts
const count = createSignal(0);
const count2 = createSignal(0, {eq: false});
createEffect(() =>  print(count()));  // prints 0, and signal is initialized
createEffect(() =>  print(count2.val));  // prints 0, and signal is initialized
count.val++ // prints 1
count(1) // prints nothing
count.set((val) => val + 1) // prints 2
count2.set((val) => val + 1) // prints 1
count(1) // prints 1
```

### createMemo
The `createMemo` function creates a memoized computation that only re-runs when its dependencies change. It takes a function as an argument and returns a readonly signal that holds the computed value.
Like createSignal, it can be lazy, eq and can be set to false or a function.
> Warning: <br> As createMemo creates a computation it has the same warning as createEffect.
> Note: <br> createMemo is also batched, no need to use batch() inside a memo.

```ts
function makeLazyMemoNode<T>(
  fn: (v: T | undefined) => T, 
  value: T | undefined, 
  options?: { 
    eq?: ((a: T, b: T) => boolean) | false, 
    lazy?: boolean 
  }
): ReadonlySignal<T>;

When the memo is used in any computation, it will automatically be tracked, and the computation will re-run when the memo's value changes.
type ReadonlySignal<T> = {
  (): T;
  readonly val: T;
  peek: T;
  accessor: () => T;
}
```
Usage:
```ts
const count = createSignal(0);
const doubleCount = createMemo(() => count() * 2);

createEffect(() => print(doubleCount.val)); // prints 0
count.val++ // prints 2
count(1) // prints nothing
count.set((val) => val + 1) // prints 4
```

### on
The `on` function is an utility to isolate tracking for one function and treatment to another one, mostly used inside computations.
If defer is set to true, on will run once, but the functrion will only be called if any of dependent signals changes once.

```ts
function on<I, T>(
  on: () => I, 
  fn: (r: I, v?: T) => T,
  options?: { 
    defer?: boolean 
  }
): (v?: T) => T;
```
Usage:
```ts
const count = createSignal(0);
const count2 = createSignal(0);
const doubleCount2 = createMemo(on(() => count2(), () => count2() + count()));
createEffect(on(() => doubleCount2(), () => print(doubleCount2.val), {defer: true})); // prints nothing
count.val++ // prints nothing, as count() is not tracked
count2.val++ // prints 2
```

### runWithOwner and getOwner
The `getOwner` function returns the current owner, and the `runWithOwner` function allows you to run a function with a specific owner, which is useful to create computations in async scopes. RunWithOwner will return the result of the function.
>Note: <br> Owner has the `apply` method who has the same effect as `runWithOwner`, who has only the function as parameter

```ts
function getOwner(): Owner | undefined;

function runWithOwner<T>(owner: Owner, fn: () => T): T;
```
Usage:
```ts
const owner = getOwner();
someAsyncInitializer().then(() => {
    const count = createSignal(0);
  runWithOwner(owner, () => {
    const doubleCount = createMemo(() => count() * 2);
    createEffect(() => print(doubleCount.val)); // prints 0
    count.val++ // prints 2
  });
  owner.apply(() => {
    createEffect(() => print(count.val)); // prints 1
  });
  count.val ++ // prints 4, and 2
  createEffect(() => print(count.val)); // warns in console that a computation without an owner will not be disposed, then prints 2
});
```

### batch
The `batch` function allows you to group multiple signal updates into a single batch, preventing unnecessary recomputations and improving performance. It takes a function as an argument and runs it within a batch context. 
When the batch is finished, all signals will be updated at once, and all computations will re-run.
> Note: <br> batch freezes the updates, so signals are only updated when batching is finished.

```ts
function batch<T>(fn: () => T): T;
```
Usage:
```ts
const count = createSignal(0);
const doubleCount = createMemo(() => count() * 2);
batch(() => {
  count.val++; // will add 1 to count.val (currently 0)
  count.val++; // will add 1 to count.val (currently 0, because of batching, that stops the signal to update)
  count.set((val) => val + 1); // will add 1 to count.val (currently 1, set can get the pending value)
}); // prints 4
```

### onDispose
The `onDispose` function allows you to register a callback that will be called when the current owner is disposed. This is useful for cleaning up event subscriptions or other resources on disposal.

```ts
function onDispose(fn: () => void): void;
```
Usage:
```ts
const count = createSignal(0);
const step = createSignal(2);
createEffect(() => {
  const currentStep = step(); 
  const interval = setInterval(() => {
    count.val+=currentStep;
  }, 1000);
  onDispose(() => clearInterval(interval)); // will clear the interval when the owner is disposed
});
step(4) // will clear the interval, then run a new interval with step 4
```

### createContext
The `createContext` function creates an object that can be used to pass data down the component tree without having to pass props explicitly. It returns a context object with a provider (named "Provider" for JSX context with "children" and "value" in props, or in ohter cases, using apply is what you wants to), you can consume it using the `useContext` function, you can pass signals into the context.
The context must be created once, the same context can provide multiple times, it will just override the value.
if you want to provide the context's default value, you can use Context.value in apply, or the Provider component's value, this way, context acts as a global variable holder

```ts
function createContext<T>(defaultValue: T): Context<T>;
type Context<T> = {
  Provider: (props: { value: T; children: any }) => void;
  getValue: () => T;
  apply: (value: T, fn: () => void) => void;
};
```
Usage:
```ts
const Context = createContext(0);

createEffect(() => {
  Context.apply(1, () => {
    print(useContext(Context)); // prints 1
    createEffect(() => {
      print(useContext(Context)); // prints 1
      const owner = getOwner(); // keep the owner to use it in async gaps
      setTimeout(() => {
        owner.apply(() => {
          print(useContext(Context)); // prints 1 after 1 second
        });
      }, 1000);
    });
  });
  print(useContext(Context)); // prints 0
});
````


## See more
Some other functions are present in code, feel free to read the code as there is JSDoc on it.