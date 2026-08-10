# Miko 性能基准

性能包是私有 Bun workspace，用于生成确定性 SPA/SSG fixture、执行真实 Miko 构建并采集 Playwright 浏览器指标。

## 运行

在仓库根目录执行：

```sh
bun run perf:baseline
bun run perf:measure
bun run perf:check
```

- `baseline`：重建并覆盖提交到仓库的优化前基线，只能在有意更新性能基线时使用。
- `measure`：生成 `packages/performance/results/miko-v1-slice-3-current.json`。
- `check`：重新测量、写入 current 结果、逐项打印相对变化，并在环境不兼容或预算超限时以非零状态退出。

`packages/performance/results/` 是本地生成目录，不提交到 Git。

## Bun 与 Node 边界

Bun 负责 workspace、依赖、根脚本和 benchmark 命令调度。性能包的脚本随后运行 `node runner.mjs`；每次被测 Miko 构建也通过 `process.execPath` 启动 Node.js worker，并用 jiti 加载 TypeScript CLI。基准不会要求 Bun 作为 Miko CLI 或应用运行时。

## 采样规则

每次完整测量包含 Small、Medium、Large、Runtime 四个 fixture：

- 每个 fixture 采集 **3 cold** build samples。
- 每个 fixture 采集 **5 warm** build samples。
- Runtime fixture 另外采集 **5 browser** samples。
- 所有数值保留原始 samples，并用中位数参与比较。

Cold 构建在每次样本前清理 `dist`、`.miko-cache` 和 `.vite-ssg-temp`；Warm 构建只清理 `dist`。构建时记录 Node worker 的耗时与峰值 RSS。浏览器在 375×812 Chromium 中记录 FCP、LCP、hydration-ready、ScriptDuration、深路由导航、传输字节和请求数。

浏览器采样同时验证请求拓扑：首屏不能请求 `/unvisited` 路由 chunk，点击 Deep route 后必须请求 `/deep/nested` 对应 chunk。

## 环境与预算

`check` 要求以下环境指纹一致：

- OS 平台与 CPU 架构；
- CPU 型号；
- Node、Bun、Vite 的 major.minor 版本。

环境不匹配时，机器敏感的耗时指标标记为 `SKIP`，但环境检查本身失败，产物体积、请求数和路由拓扑仍继续检查。

预算：

- cold/warm build 与 peak RSS：最多回退 10%；
- JS/CSS/HTML/asset 数量与浏览器运行时指标：最多回退 5%；
- 未访问路由 chunk：始终不得被请求。

测量期间应避免并行构建、浏览器自动化、杀毒扫描峰值或其他高 CPU 任务。一次失败应先检查逐样本分布与系统负载，再在同一环境重新采样，不能只挑选有利结果。
