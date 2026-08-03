import { describe, expect, it } from 'vitest';
import { normalizeEnvArg, resolveMode } from './env';

describe('normalizeEnvArg', () => {
  it('未传值时返回 undefined', () => {
    expect(normalizeEnvArg(undefined)).toBeUndefined();
    expect(normalizeEnvArg(null)).toBeUndefined();
    expect(normalizeEnvArg('')).toBeUndefined();
  });

  it('合法字符串原样返回', () => {
    expect(normalizeEnvArg('test')).toBe('test');
    expect(normalizeEnvArg('staging-2')).toBe('staging-2');
  });

  it('重复传值时取最后一个', () => {
    expect(normalizeEnvArg(['test', 'staging'])).toBe('staging');
  });

  it('非法字符抛错', () => {
    expect(() => normalizeEnvArg('../x')).toThrow(/非法 --env/);
    expect(() => normalizeEnvArg('a b')).toThrow(/非法 --env/);
  });
});

describe('resolveMode', () => {
  it('build 缺省 production', () => {
    expect(resolveMode(undefined, 'build')).toBe('production');
  });

  it('serve 缺省 development', () => {
    expect(resolveMode(undefined, 'serve')).toBe('development');
  });

  it('指定 --env 后覆盖默认值', () => {
    expect(resolveMode('test', 'build')).toBe('test');
    expect(resolveMode('test', 'serve')).toBe('test');
  });
});