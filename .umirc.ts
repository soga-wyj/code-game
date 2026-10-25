import { defineConfig } from "umi";

// 三套产物：
// dev：本地开发直接加载本地资源
// 默认 build：GitHub Pages 部署（docs/）
// APP_TARGET=offline：离线包（offline/），相对路径 + hash 路由，双击 index.html 就能用
const isProd = process.env.NODE_ENV === 'production';
const isOffline = process.env.APP_TARGET === 'offline';

export default defineConfig({
  base: isOffline ? "/" : isProd ? "/code-game" : "/",
  publicPath: isOffline ? "./" : isProd ? "https://ui.zdean.cn/code-game/" : "/",
  history: { type: isOffline ? 'hash' : 'browser' },
  title: "言语字帖 · 考公打字练习",
  outputPath: isOffline ? 'offline' : 'docs',
  routes: [
    { path: "/", component: "App" }
  ],
  npmClient: 'yarn',
});
