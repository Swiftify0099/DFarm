/**
 * Empty Node.js Builtin Module Shim for React Native / Expo Metro Bundler.
 * Resolves 'path', 'node:path', 'fs', 'node:fs' safely in client-side bundles.
 */

export const resolve = (...args: string[]): string => args.filter(Boolean).join('/');
export const join = (...args: string[]): string => args.filter(Boolean).join('/');
export const dirname = (p: string): string => p.split('/').slice(0, -1).join('/') || '/';
export const basename = (p: string): string => p.split('/').pop() || '';
export const extname = (p: string): string => {
  const base = basename(p);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx) : '';
};

export const existsSync = (_p: string): boolean => false;
export const readFileSync = (_p: string, _encoding?: string): string => '';
export const writeFileSync = (_p: string, _data: any): void => {};
export const statSync = (_p: string): any => ({ isDirectory: () => false, isFile: () => true });

export default {
  resolve,
  join,
  dirname,
  basename,
  extname,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
};
