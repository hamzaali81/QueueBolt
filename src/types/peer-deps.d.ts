/**
 * Minimal type stubs for optional peer dependencies.
 * Used for declaration emit when packages are not installed locally.
 */
declare module "better-sqlite3" {
  interface RunResult {
    changes: number;
  }

  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface Database {
    pragma(source: string): unknown;
    exec(source: string): unknown;
    prepare(source: string): Statement;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
  export { Database };
}

declare module "ioredis" {
  interface ChainableCommander {
    set(key: string, value: string): this;
    zadd(key: string, score: number, member: string): this;
    zrem(key: string, member: string): this;
    del(key: string): this;
    exec(): Promise<unknown>;
  }

  class Redis {
    constructor(options?: Record<string, unknown>);
    get(key: string): Promise<string | null>;
    zrange(key: string, start: number, stop: number): Promise<string[]>;
    zcard(key: string): Promise<number>;
    multi(): ChainableCommander;
    quit(): Promise<string>;
  }

  export default Redis;
  export { Redis };
}
