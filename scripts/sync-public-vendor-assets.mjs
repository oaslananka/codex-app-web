import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeLoggerModule from '../src/lib/logging/node-logger.cjs';

const { createNodeLogger } = nodeLoggerModule;
const logger = createNodeLogger('script:sync-vendor');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const vendorDir = path.join(projectRoot, 'public', 'vendor');

const assets = [
  {
    source: path.join(projectRoot, 'node_modules', 'marked', 'lib', 'marked.umd.js'),
    target: path.join(vendorDir, 'marked.min.js'),
  },
  {
    source: path.join(projectRoot, 'node_modules', 'dompurify', 'dist', 'purify.min.js'),
    target: path.join(vendorDir, 'purify.min.js'),
  },
  {
    source: path.join(
      projectRoot,
      'node_modules',
      '@highlightjs',
      'cdn-assets',
      'highlight.min.js',
    ),
    target: path.join(vendorDir, 'highlight.min.js'),
  },
  {
    source: path.join(
      projectRoot,
      'node_modules',
      '@highlightjs',
      'cdn-assets',
      'styles',
      'github-dark.min.css',
    ),
    target: path.join(vendorDir, 'github-dark.min.css'),
  },
];

mkdirSync(vendorDir, { recursive: true });

let copied = 0;
let unchanged = 0;

for (const asset of assets) {
  if (!existsSync(asset.source)) {
    throw new Error(`Vendor asset not found: ${asset.source}`);
  }

  if (existsSync(asset.target)) {
    const sourceContents = readFileSync(asset.source);
    const targetContents = readFileSync(asset.target);

    if (sourceContents.equals(targetContents)) {
      unchanged += 1;
      continue;
    }
  }

  copyFileSync(asset.source, asset.target);
  copied += 1;
}

logger.info(`Synced ${assets.length} vendor assets`, { copied, unchanged, vendorDir });
