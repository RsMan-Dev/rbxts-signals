import { createEffect, createMemo, createSignal, on, onCleanup, untrack } from "../index";
import { RunService } from "@rbxts/services";

export type TweenProps = {
  duration?: number;
  ease?: (t: number) => number;
};

/**
 * # Tween
 * Creates a tween signal that animates a value from its current value to the target value over a specified duration.
 * @param target A function that returns the target value to tween to.
 * @param param1 An object containing the tween properties.
 * @returns A signal that represents the current value of the tween.
 */
export function createTween(
  target: () => number,
  { ease = (t: number) => t, duration = 100 }: TweenProps = {},
) {
  const elapsed = createSignal(0);
  let from: number = untrack(target);
  let delta: number = 0;
  const current = createMemo(() => from + delta * ease(elapsed() / duration));
  let connection: RBXScriptConnection | undefined = undefined;

  function tick(dt: number) {
    elapsed.set(prev => {
      const nextVal = math.clamp(prev + (dt * 1000), 0, duration);
      if (nextVal === duration) connection?.Disconnect();
      return nextVal;
    });
  }

  createEffect(
    on(
      target,
      (target) => {
        from = current();
        delta = target - from;
        elapsed(0);
        connection = RunService.Heartbeat.Connect(tick)
        onCleanup(() => connection?.Disconnect());
      },
      { defer: true },
    ),
  );

  return current;
}

/**
 * # createTweened
 * Creates a tweened signal that animates a value from its next value to the target value over a specified duration.
 * @param value The initial value of the tweened signal.
 * @param props An object containing the tween properties.
 * @returns A tuple containing the tweened signal and a setter function to update the value.
 */
export function createTweened(value: number, props?: TweenProps) {
  const signal = createSignal(value);
  const tween = createTween(signal, props);
  return [tween, (value: number) => signal(value)] as const;
}

