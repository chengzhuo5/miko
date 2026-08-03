#!/usr/bin/env node
import parser from 'yargs-parser';
import { pickEnvArg, loadEnvFiles } from './env.ts';

const { _, lib, env, mode } = parser(process.argv.slice(2));
if (_.length === 0) {
  console.log('请指定命令');
  process.exit(1);
}
if (lib) process.env.MIKO_LIB_MODE = '1';

let envArg: string | undefined;
try {
  envArg = pickEnvArg(env, mode);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
if (envArg) {
  process.env.MIKO_MODE = envArg;
}
loadEnvFiles(envArg);

await import(`./${_[0]}.ts`);