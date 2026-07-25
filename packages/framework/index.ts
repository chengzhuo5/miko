export default Object.fromEntries(
  Object.entries(
    import.meta.glob<true, string, Record<string, any>>(['./modules/**/*.ts'], {
      eager: true,
    }),
  )
    .filter(([key]) => key)
    .map(([key, value]) => [
      key.slice('./modules/'.length).split('.')[0],
      Object.keys(value).length === 1 && Reflect.has(value, 'default') ? value.default : value,
    ]),
);
