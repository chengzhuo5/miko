// @ts-expect-error 此处导入带编译器的esm版本。之所以要将vue-demi作为全局资源包是因为它对vite兼容兼容性不佳，打包后会残留import XXX from "vue"
import * as Vue from 'vue/dist/vue.esm-bundler.js';
// @ts-expect-error 理由同上
export * from 'vue/dist/vue.esm-bundler.js';

const isVue2 = false;
const isVue3 = true;
const Vue2 = undefined;

function install() {
  //
}

export function set(
  target: unknown[] | Record<PropertyKey, unknown>,
  key: string | number,
  val: unknown
) {
  if (Array.isArray(target)) {
    target.length = Math.max(target.length, key as number);
    target.splice(key as number, 1, val);
    return val;
  }
  target[key] = val;
  return val;
}

export function del(
  target: unknown[] | Record<PropertyKey, unknown>,
  key: string | number
) {
  if (Array.isArray(target)) {
    target.splice(key as number, 1);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete target[key];
}

export { Vue, Vue2, isVue2, isVue3, install };
