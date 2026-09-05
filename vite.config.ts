import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 保证构建产物可通过 file:// 协议直接打开（本地离线使用 / Tauri 打包）
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    /**
     * host: true → 监听 0.0.0.0 / ::（所有网卡），支持局域网通过本机 IP 访问。
     * 默认只绑 localhost（在 Node 17+ 会解析为 ::1），会导致「localhost 能开、局域网 IP 访问不了」。
     */
    host: true,
    /**
     * 端口约定：本项目统一使用 200xx 段（20001 起）。
     * 不设置 strictPort，端口被占用时由 Vite 自动顺延到下一个可用端口。
     */
    port: 20001,
    open: false,
  },
  preview: {
    // 与 server 保持一致，允许局域网 / 本机 IP 访问预览产物
    host: true,
    port: 20002,
    open: false,
  },
  build: {
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        /**
         * 只把「首屏本来就要加载」的公共依赖显式分出来，其余交给 Rolldown 自动分块。
         *
         * 不要给引擎单独指定 manualChunks：Rolldown 会把 __vitePreload 之类的共享
         * 辅助函数塞进那个 chunk，导致入口反过来静态依赖它，引擎 chunk 被写进
         * index.html 的 modulepreload，懒加载直接失效（首屏体积反而回升到数 MB）。
         * 引擎的拆分由 React.lazy 的动态 import 驱动即可。
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (/node_modules[\\/]lucide/.test(id)) return 'vendor-icons';
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
