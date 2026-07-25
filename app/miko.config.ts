/**
 * miko 项目配置文件（可选，所有字段均可选，配置文件也可以不存在）
 *
 * mikoPlugin() 会自动加载此文件。
 */

export default {
  /** UI 组件库：'vant'（默认）| 'element-plus' */
  uiLibrary: 'vant' as 'vant' | 'element-plus',

  /** 默认布局名（默认 'flexible'） */
  // layout: 'flexible',

  /** 模板目录路径（默认自动探测） */
  // template: 'template',

  /** 应用入口文件路径（默认 <template>/main.ts） */
  // entry: 'template/main.ts',

  /** 构建输出目录（默认 ./dist） */
  // outDir: 'dist',

  /**
   * 开发服务器代理配置
   *
   * 数组格式：webpack-dev-server 风格，适合多个路径映射到同一目标
   */
  proxy: [
    // {
    //   context: ['/api/**'],
    //   target: 'https://dev.example.com',
    //   changeOrigin: true,
    // },
  ],

  /** 库模式配置（供 miko build --lib 使用） */
  // lib: {
  //   entry: 'src/index.ts',
  //   formats: ['es', 'cjs'],
  // },
}
