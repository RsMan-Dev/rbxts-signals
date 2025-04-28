# @rbxts/signals

[![npm version](https://img.shields.io/npm/v/@rbxts/signals)](https://www.npmjs.com/package/@rbxts/signals)
[![GitHub license](https://img.shields.io/github/license/RsMan-Dev/rbxts-signals)](https://github.com/RsMan-Dev/rbxts-signals/blob/main/LICENSE)

A powerful reactive system for Roblox TypeScript projects, inspired by S.js, SolidJS, Preact Signals, and Signals.dart. This library provides an efficient way to manage reactive state and computations in your Roblox games.

The library heavily depends on [@rbxts/jsnatives](https://github.com/RsMan-Dev/rbxts-jsnatives) for stores, and its utilities, like `Object.isCallable` is useful to check signals. Make sure to use all its features:
- loops using `Object.keys`, `Object.values`, `Object.entries`.
- `Object.isCallable` to check if an element is callable (functions or table with `__call` metamethod).
- `Object.isArray` to check if an element is an array.
- `JSON.stringify` and `JSON.parse` to log, store, send values.  

This way, proxies or any other non-lua elements will become almost invisible to the developper.


## Table of Contents

- [Installation](#installation)
- [Key Concepts](#key-concepts)
- [API Reference](#api-reference)
  - [createRoot](#➤-createroot)
  - [createEffect](#➤-createeffect)
  - [createSignal](#➤-createsignal)
  - [createMemo](#➤-creatememo)
  - [on](#➤-on)
  - [runWithOwner and getOwner](#➤-runwithowner-and-getowner)
  - [batch](#➤-batch)
  - [onDispose](#➤-ondispose)
  - [createContext](#➤-createcontext)
- [Primitives API Reference](#primitives-api-reference)
  - [Animation Primitives](#➤-animation-primitives)
  - [Tween Primitives](#➤-tween-primitives)
- [Store API Reference](#store-api-reference)
  - [Mutable Store](#➤-mutable-store)
- [License](#license)
- [Contributing](#contributing)

## Installation

Currently available through GitHub:

```bash
npm install @rbxts/signals@github:RsMan-Dev/rbxts-signals
```

> Note: NPM package coming soon!

## Key Concepts

### Signals
Signals are reactive primitives that hold a value and notify subscribers when the value changes. They are the foundation of the reactive system.

### Owners
Owners are the context in which computations are executed. They manage the lifecycle of computations and their dependencies.

### Computations
Computations are functions that depend on signals. They automatically re-run when their dependencies change, allowing for reactive updates. Computations can be nested and will track only their direct dependencies.

### Batching
Batching allows multiple signal updates to be processed together, reducing unnecessary recomputations and improving performance. A batch freezes the updates, so signals are only updated when batching is finished.

## API Reference

### ➤ createRoot

Creates a new owner and runs a function within that owner. Returns the result of the function.

> ⚠️ Warning: Unlike other functions that manipulate owner, `createRoot` does not auto-dispose when its parent owner is disposed. If you want automatic disposal, use `onDispose`.

```typescript
function createRoot<T>(fn: (dispose: () => void) => T): T;
```

Example:
```typescript
let dispose: Owner | undefined;
createRoot((disposeFn) => {
  dispose = disposeFn;
  const count = createSignal(0);
  const doubleCount = createMemo(() => count() * 2);
  createEffect(() => print(doubleCount.val)); // prints 0
  count.val++; // prints 2
  onDispose(() => print("dispose called")); // prints "dispose called"
});
dispose?.(); // prints "dispose called", inner effects are disposed
```
<hr>

### ➤ createEffect

Creates a new computation that runs whenever its dependencies change.

> ⚠️ Warning:
> - The computation result is not memoized
> - Any computation made outside an owner will never be disposed, causing memory leaks
>
> ℹ️ Note: Effects are batched, no need to use `batch()` inside an effect.

```typescript
function createEffect<T>(
  fn: (value: T | undefined) => T,
  value?: T
): () => T;
```
<hr>

### ➤ createSignal

Creates a new signal with an initial value.

> ℹ️ Note: 
> - `Signal` is a table, wrapped using metatable to provide all methods and direct call, so `typeof(signal)` will return `table`, use `Object.isCallable` to check if element can be called.
> - as `Signal` is a table, if you make no usage of utilities, you can unwrap the metatable like `const {accessor: count, set: countSet} = createSignal(0)`, the table will get garbage collected, and you will only have essential methods.
> - when signal is lazy, it will be initialized on first use, so it can be used in class properties.

```typescript
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

Example:
```typescript
const count = createSignal(0);
const count2 = createSignal(0, { eq: false });

createEffect(() => print(count())); // prints 0, count is initialized
createEffect(() => print(count2.val)); // prints 0, count2 is initialized

count.val++; // prints 1
count(1); // prints nothing, as it's the same value
count.set((val) => val + 1); // prints 2
count2.set((val) => val + 1); // prints 1
count(1); // prints 1, as eq is false
```
<hr>

### ➤ createMemo

Creates a memoized computation that only re-runs when its dependencies change.

> ⚠️ Warning: As `createMemo` creates a computation, it has the same warnings as `createEffect`.
>
> ℹ️ Note: 
> - `createMemo` is also batched, no need to use `batch()` inside a memo, if any external modification is made in the effect.
> - `createMemo` is lazy, so it will be initialized on first use, so it can be used in class properties, the owner used will be the one that was set when createMemo was called, or the owner that is set when the memo is used, so make sure the owner is set where you want it, to avoid unpredicted cleanups of the memo effect.
> - `createMemo` is a readonly signal, like `Signal`, it's a table, so the same warnings apply, can be unwrapped like `const memo = createMemo(() => count()).accessor`, the table will get garbage collected, and you will only have essential method.  


```typescript
function createMemo<T>(
  fn: (v: T | undefined) => T, 
  value: T | undefined, 
  options?: { 
    eq?: ((a: T, b: T) => boolean) | false, 
    lazy?: boolean 
  }
): ReadonlySignal<T>;

type ReadonlySignal<T> = {
  (): T;
  readonly val: T;
  peek: T;
  accessor: () => T;
}
```
Example: 
```ts
const count = createSignal(0);
const doubleCount = createMemo(() => count() * 2);

createEffect(() => print(doubleCount.val)); // prints 0
count.val++ // prints 2
count(1) // prints nothing
count.set((val) => val + 1) // prints 4
```
<hr>

### ➤ on

Utility to isolate tracking for one function and treatment to another one, mostly used inside computations.
Its option defer is used to defer the treatment of the function, so it will be called after the first update of any of its dependencies, the initialization will not run the treatment.

```typescript
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

createEffect(on(() => doubleCount2(), () => print(doubleCount2.val, count.val), {defer: true})); // prints nothing

count.val++ // prints nothing, as count() is not tracked
count2.val++ // prints 2 1
```
<hr>

### runWithOwner and getOwner

`getOwner` returns the current owner, and `runWithOwner` allows running a function with a specific owner. Useful on async functions, or when you want to control the owner of a computation. `Owner.apply` has the same effect as `runWithOwner`.

```typescript
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
    count.val ++ // prints 2
  });
  owner.apply(() => createEffect(() => print(count.val)));// prints 1
  count.val ++ // prints 4, and 2
  createEffect(() => print(count.val)); // warns in console that a computation without an owner will never be disposed, then prints 2
});
```
<hr>

### batch

Groups multiple signal updates into a single batch, preventing unnecessary recomputations.

```typescript
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

Registers a callback that will be called when the current owner is disposed.

```typescript
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

Creates a context object for passing data down the graph. `CountContext.Provider` exists for jsx compatibility. Contexts can pass any value (signals, tables, classes, etc), and can be used with `useContext` to get the value from the context.

```typescript
function createContext<T>(defaultValue: T): Context<T>;
```
Usage:
```ts
const CountContext = createContext(0);

createEffect(() => {
  CountContext.apply(1, () => {
    print(useContext(CountContext)); // prints 1
    createEffect(() => {
      print(useContext(CountContext)); // prints 1
      const owner = getOwner(); // keep the owner to use it in async gaps
      setTimeout(() => {
        owner.apply(() => {
          print(useContext(CountContext)); // prints 1 after 1 second
        });
      }, 1000);
    });
  });
  print(useContext(CountContext)); // prints 0
});
```

## Primitives API Reference

### ➤ Animation Primitives

#### keyframes
Creates a keyframe animation function that interpolates between multiple keyframes

> ℹ️ Note:
> - The first keyframe is the starting point, defining easing here will have no effect.
> - Easing functions can be keyframes too, to make the animation more complex.

```typescript
function keyframes(
  ...keys: { at: number; value: number, easing?: (t: number) => number }[]
): (t: number) => number;
```

Example:
```typescript
const animation = keyframes(
  { at: 0, value: 0 },                               // starting point, defining easing here will have no effect
  { at: 0.5, value: 100, easing: curves.easeInOut }, // Between 0 and 0.5, the animation will ease in and out from 0 to 100
  { at: 1, value: 0 }                                // Between 0.5 and 1, the animation will linearly go from 100 to 0
);

// Use the animation function with a progress value (0 to 1)
const value = animation(0.5); // Returns 100
```

#### curves
A collection of basic easing functions for animations:

```typescript
const curves = {
  linear: (t: number) => number,
  easeIn: (t: number) => number,
  easeOut: (t: number) => number,
  easeInOut: (t: number) => number,
  bounce: (t: number) => number,
  bounceIn: (t: number) => number,
  bounceOut: (t: number) => number,
  bounceInOut: (t: number) => number,
  elastic: (t: number) => number,
  elasticIn: (t: number) => number,
  elasticOut: (t: number) => number,
  elasticInOut: (t: number) => number,
  back: (t: number) => number,
  backIn: (t: number) => number,
  backOut: (t: number) => number,
  backInOut: (t: number) => number,
  steps: (steps: number, direction: 'start' | 'end' | 'both' = 'end') => (t: number) => number,
  cubicBezier: (p0: Point, p1: Point, p2: Point, p3: Point) => (t: number) => number
};

interface Point {
  x: number;
  y: number;
}
```

### ➤ Tween Primitives

#### createTween
Creates a tween signal that animates a value from its current value to the target value over a specified duration. Easing can be keyframes too.

```typescript
function createTween(
  target: () => number,
  { ease = (t: number) => t, duration = 100 }: TweenProps = {}
): ReadonlySignal<number>;
```

Example:
```typescript
const target = createSignal(0);
const tween = createTween(target, { 
  duration: 1000,
  ease: curves.easeInOut 
});

createEffect(() => print(tween())); // Will print values from 0 to 100
target(100); // Starts tweening to 100, easing in and out, in 1 second
```

#### createTweened
Creates a tweened signal that animates a value from its current value to the next value when its target changes.

```typescript
function createTweened(
  value: number, 
  props?: TweenProps
): [ReadonlySignal<number>, (value: number) => void];
```

Example:
```typescript
const [tweened, setTweened] = createTweened(0, {
  duration: 1000,
  ease: curves.easeInOut
});

createEffect(() => print(tweened())); // Will print values from 0 to 100
setTweened(100); // Starts tweening to 100
```

## Store API Reference

### ➤ Mutable Store

#### createMutable
Creates a mutable store that will transform objects in a big graph of reactive signals, so any change to the object will trigger fine-grained updates. Updating a whole object using the same type of object will patch the object, avoiding replacing the whole object.

```typescript
function createMutable<T extends object>(obj: T): T;
```

Example:
```typescript
const store = createMutable({
  user: {
    name: "John",
    age: 30,
    friends: ["Alice", "Bob"]
  }
});

createEffect(() => {
  print(store.user.name); // Will print when name or user structure changes
  print(store.user.friends[0]); // Will print when first friend or friends array structure, or user structure changes
});

store.user.name = "Jane"; // Triggers effect
store.user.friends.push("Charlie"); // Triggers effect
store.user = {
  name: "Jane",
  age: 30,
  friends: ["Alice", "Bob"]
}; // Triggers only the second effect, as user doesn't change its structure, and its name remains the same
```

#### unwrap
Unwraps a mutable store to get a cloned mirror of the original object, so any change to the original object will not trigger effects.

```typescript
function unwrap<T>(obj: T, untracks = true): T;
```

Example:
```typescript
const store = createMutable({ value: 1 });
const raw = unwrap(store); // Returns { value: 1 }
```

#### withWrap
If the object was wrapped in a mutable before, it will find the wrap and apply it again.

```typescript
function withWrap<T extends object>(obj: T): T;
```

#### withoutWrap
If the object was wrapped in a mutable before, it will return the original object without any wrap.

```typescript
function withoutWrap<T extends object>(obj: T, untracked = true): T;
```

> ℹ️ Note:
> - Mutable stores automatically track nested objects and arrays
> - Changes to nested values trigger updates in computations
> - Use `unwrap` to get a mirror of the original object, so any change to the original object will not affect the value returned by `unwrap`.
> - Use `withWrap` and `withoutWrap` to control the tracking when manipulating the object.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## Acknowledgments

This library was inspired by:
- [S.js](https://github.com/adamhaile/S)
- [SolidJS](https://github.com/solidjs/solid)
- [@preact/signals-react](https://www.npmjs.com/package/@preact/signals-react)
- [signals.dart](https://github.com/rodydavis/signals.dart)