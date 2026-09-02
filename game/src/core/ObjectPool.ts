/** §18 — pooling: nada de alocar/descartar objetos por frame. */
export class ObjectPool<T> {
  private free: T[] = [];

  constructor(private factory: () => T, private resetFn: (item: T) => void, prealloc = 0) {
    for (let i = 0; i < prealloc; i++) this.free.push(factory());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.factory();
    return item;
  }

  release(item: T): void {
    this.resetFn(item);
    this.free.push(item);
  }

  get available(): number { return this.free.length; }
}
