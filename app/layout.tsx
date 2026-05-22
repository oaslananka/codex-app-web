import type { Metadata } from 'next';
import './globals.css';
import '../src/styles/control-center.css';
import '../src/styles/control-center-layout.css';
import '../src/styles/control-center-panels.css';
import '../src/styles/control-center-overlays.css';
import '../src/styles/control-center-responsive.css';

export const metadata: Metadata = {
  title: {
    default: 'codex-app-web',
    template: '%s | codex-app-web',
  },
  description:
    'Independent, open-source browser control center compatible with Codex app-server workflows, including chat, files, terminal, approvals, config, MCP visibility, and runtime diagnostics.',
  applicationName: 'codex-app-web',
  keywords: [
    'Codex',
    'app-server',
    'web UI',
    'control center',
    'developer tools',
    'community-maintained',
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link key="github-dark-stylesheet" rel="stylesheet" href="/vendor/github-dark.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
