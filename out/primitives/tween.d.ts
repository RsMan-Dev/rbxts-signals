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
export declare function createTween(target: () => number, { ease, duration }?: TweenProps): import("../signals").ReadonlySignal<number>;
/**
 * # createTweened
 * Creates a tweened signal that animates a value from its next value to the target value over a specified duration.
 * @param value The initial value of the tweened signal.
 * @param props An object containing the tween properties.
 * @returns A tuple containing the tweened signal and a setter function to update the value.
 */
export declare function createTweened(value: number, props?: TweenProps): readonly [import("../signals").ReadonlySignal<number>, (value: number) => number];
