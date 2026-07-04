import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageDir = (packageName) => dirname(require.resolve(`${packageName}/package.json`));
const reactDir = packageDir("react");
const reactDomDir = packageDir("react-dom");
const schedulerDir = packageDir("scheduler");

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
    alias: [
      { find: /^react$/, replacement: join(reactDir, "index.js") },
      { find: /^react\/jsx-runtime$/, replacement: join(reactDir, "jsx-runtime.js") },
      { find: /^react\/jsx-dev-runtime$/, replacement: join(reactDir, "jsx-dev-runtime.js") },
      { find: /^react-dom\/client$/, replacement: join(reactDomDir, "client.js") },
      { find: /^scheduler$/, replacement: join(schedulerDir, "index.js") },
    ],
  },
  optimizeDeps: {
    esbuildOptions: {
      preserveSymlinks: true,
    },
  },
});
