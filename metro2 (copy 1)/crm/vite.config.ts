import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, 'public');

function getHtmlInputs(dir: string, base = dir): Record<string, string> {
  const entries: Record<string, string> = {};
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      const sub = getHtmlInputs(fullPath, base);
      Object.assign(entries, sub);
    } else if (item.name.endsWith('.html')) {
      const rel = path.relative(base, fullPath);
      const key = rel.replace(/\\/g, '/').replace('.html', '').replace(/\//g, '__');
      entries[key] = fullPath;
    }
  }
  return entries;
}

export default defineConfig({
  root: PUBLIC_DIR,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: getHtmlInputs(PUBLIC_DIR),
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
