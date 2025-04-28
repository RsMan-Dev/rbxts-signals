export declare function keyframes(...keys: {
    at: number;
    value: number;
    easing?: (t: number) => number;
}[]): (t: number) => number;
interface Point {
    x: number;
    y: number;
}
export declare const curves: {
    cubicBezier: (p0: Point, p1: Point, p2: Point, p3: Point) => (t: number) => number;
    linear: (t: number) => number;
    easeIn: (t: number) => number;
    easeOut: (t: number) => number;
    easeInOut: (t: number) => number;
    bounce: (t: number) => number;
    bounceIn: (t: number) => number;
    bounceOut: (t: number) => number;
    bounceInOut: (t: number) => number;
    elastic: (t: number) => number;
    elasticIn: (t: number) => number;
    elasticOut: (t: number) => number;
    elasticInOut: (t: number) => number;
    back: (t: number) => number;
    backIn: (t: number) => number;
    backOut: (t: number) => number;
    backInOut: (t: number) => number;
    steps: (steps: number, direction?: "start" | "end" | "both") => (t: number) => number;
};
export {};
