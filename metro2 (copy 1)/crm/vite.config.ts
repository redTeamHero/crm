import { defineConfig } from 'vite';
import { resolve } from 'path';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, 'public');

function getHtmlInputs(): Record<string, string> {
  const entries: Record<string, string> = {};
  const files = glob.sync('**/*.html', { cwd: PUBLIC_DIR, absolute: true });
  for (const fullPath of files) {
    const rel = path.relative(PUBLIC_DIR, fullPath);
    const key = rel.replace(/\\/g, '/').replace('.html', '').replace(/\//g, '__');
    entries[key] = fullPath;
  }
  return entries;
}

export default defineConfig({
  root: PUBLIC_DIR,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: getHtmlInputs(),
    },
  },
  server: {
    middlewareMode: true,
    fs: {
      allow: [__dirname],
    },
  },
  appType: 'mpa',
});
