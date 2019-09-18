import 'reflect-metadata';
const m = {
  c: [4, 5],
  d: 6
}

const z = {
  param(i: number) {
    return (target: Object, property: string, index: number) => {
      const t = target.constructor.prototype[property];
      if (!Reflect.hasMetadata('x', t)) Reflect.defineMetadata('x', [], t);
      const value = Reflect.getMetadata('x', t);
      value[index] = m.c[i];
      Reflect.defineMetadata('x', value, t);
    }
  },
  user(target: Object, property: string, index: number) {
    const t = target.constructor.prototype[property];
    if (!Reflect.hasMetadata('x', t)) Reflect.defineMetadata('x', [], t);
    const value = Reflect.getMetadata('x', t);
    value[index] = m.d;
    Reflect.defineMetadata('x', value, t);
  }
}

class TEST {
  abc(@z.param(0) a: number, @z.param(1) b: number, @z.user c: number) {
    return a + b + c;
  }
}

const v = Reflect.getMetadata('x', TEST.prototype.abc) as [number, number, number];

const test = new TEST();

console.log(test.abc(...v));


