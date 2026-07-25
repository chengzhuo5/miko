#!/usr/bin/env bun
import dotenv from 'dotenv';
import parser from 'yargs-parser';

if (!process.versions.bun) {
  dotenv.config();
}

const { _, lib } = parser(process.argv.slice(2));
if (_.length === 0) {
  console.log('请指定命令');
  process.exit(1);
}
if (lib) process.env.MIKO_LIB_MODE = '1';
await import(`./${_[0]}.ts`);
