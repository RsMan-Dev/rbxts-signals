export function keyframes(
  ...keys: { at: number; value: number, easing?: (t: number) => number }[]
): (t: number) => number {
  return (t: number) => {
    if (t <= 0) return keys[0].value;
    if (t >= 1) return keys[keys.size() - 1].value;

    let prevKey = keys[0];
    for (let i = 1; i < keys.size(); i++) {
      const key = keys[i];
      if (t <= key.at) {
        const progress = (t - prevKey.at) / (key.at - prevKey.at);
        const easing = key.easing || curves.linear;
        return prevKey.value + easing(progress) * (key.value - prevKey.value);
      }
      prevKey = key;
    }
    return keys[keys.size() - 1].value;
  };
}

interface Point {
  x: number;
  y: number;
}

export const curves = {
  cubicBezier: (p0: Point, p1: Point, p2: Point, p3: Point) => {
    return (t: number): number => {
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;
  
      return uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;
    };
  }
  ,
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  bounce: (t: number) => {
    if (t < 0.36363636) return 7.5625 * t * t;
    else if (t < 0.72727273) return 7.5625 * (t -= 0.54545455) * t + 0.75;
    else if (t < 0.90909091) return 7.5625 * (t -= 0.81818182) * t + 0.9375;
    else return 7.5625 * (t -= 0.95454545) * t + 0.984375;
  },
  bounceIn: (t: number) => 1 - curves.bounce(1 - t),
  bounceOut: (t: number) => curves.bounce(t),
  bounceInOut: (t: number) =>
    t < 0.5
      ? (1 - curves.bounce(1 - 2 * t)) / 2
      : (1 + curves.bounce(2 * t - 1)) / 2,
  elastic: (t: number) => {
    const c4 = (2 * math.pi) / 3;
    return t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? (math.pow(2, 20 * t - 10) * math.sin((t * 20 - 11.125) * c4)) / 2
          : (math.pow(2, -20 * t + 10) * math.sin((t * 20 - 11.125) * c4)) / -2 + 1;
  },
  elasticIn: (t: number) => 1 - curves.elastic(1 - t),
  elasticOut: (t: number) => curves.elastic(t),
  elasticInOut: (t: number) =>
    t < 0.5
      ? (1 - curves.elastic(1 - 2 * t)) / 2
      : (1 + curves.elastic(2 * t - 1)) / 2,
  back: (t: number) => {
    const s = 1.70158;
    return t * t * ((s + 1) * t - s);
  },
  backIn: (t: number) => curves.back(t),
  backOut: (t: number) => {
    const s = 1.70158;
    return (t -= 1) * t * ((s + 1) * t + s) + 1;
  },
  backInOut: (t: number) => {
    const s = 1.70158;
    return t < 0.5
      ? (t * t * ((s + 1) * t - s)) / 2
      : ((t -= 1) * t * ((s + 1) * t + s)) / 2 + 1;
  },
  steps: (steps: number, direction: 'start' | 'end' | 'both' = 'end') => {
    const stepSize = 1 / steps;
    return (t: number) => {
      const step = math.floor(t / stepSize);
      if (direction === 'start') {
        return step * stepSize;
      } else if (direction === 'end') {
        return (step + 1) * stepSize;
      } else {
        return (step + 0.5) * stepSize;
      }
    };
  }
}