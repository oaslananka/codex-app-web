import type { NextConfig } from 'next';
import os from 'os';
import path from 'path';

function getAllowedDevOrigins() {
  const values = new Set(['localhost', '127.0.0.1']);

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        values.add(entry.address);
      }
    }
  }

  const extraOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const origin of extraOrigins) {
    values.add(origin);
  }

  return [...values];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
