import { resolve } from 'path'
import checker from 'vite-plugin-checker'
import tsconfigPaths from 'vite-tsconfig-paths'

export default {
  root: 'src/',

  resolve: {
    dedupe: ['three'], // 1 instance Three.js dùng chung archplan + building-kit + threejs-modules
    alias: {
      '@': resolve(__dirname, 'src'),
      'threejs-modules': resolve(__dirname, '../threejs-modules'),
      'building-kit': resolve(__dirname, '../threejs-modules/building'), // shared building engine
      assets: resolve(__dirname, '../../assets'), // shared 3D assets (textures…) — import ?url + meta.json
    },
  },

  server: {
    host: true,
    port: 3002, // 3001 = Doraemon
    open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env),
    fs: { allow: [resolve(__dirname, '..'), resolve(__dirname, '../../assets')] }, // serve THREEJS/ (modules) + Engine/assets/
  },

  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false, // prod: giấu source TS + nhẹ ~6MB. Dev (:3002) vẫn có sourcemap để debug.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'), // editor (ArchPlanLab — nặng)
        viewer: resolve(__dirname, 'src/viewer.html'), // showcase viewer (portfolio — nhẹ)
        demo: resolve(__dirname, 'src/demo.html'), // tool-demo nghịch (cộng đồng — nhẹ)
      },
      output: { manualChunks: { 'three-vendor': ['three'] } },
    },
  },

  plugins: [
    tsconfigPaths(),
    checker({ typescript: true, eslint: { useFlatConfig: true, lintCommand: 'eslint .' } }),
  ],
}
