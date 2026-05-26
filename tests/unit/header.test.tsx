import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Header } from '../../src/components/codex/Header';

function renderHeader(overrides: Partial<Parameters<typeof Header>[0]> = {}) {
  return renderToStaticMarkup(
    <Header
      activeInfoTab="models"
      activeTab="chat"
      accountEmail="e2e@example.com"
      accountPlan="pro"
      connectionState="connected"
      integrationWarningCount={0}
      isSidebarOpen={false}
      showCommentary={false}
      onOpenIntegrationWarnings={vi.fn()}
      onOpenMcp={vi.fn()}
      onOpenModels={vi.fn()}
      onOpenPlugins={vi.fn()}
      onOpenSettings={vi.fn()}
      onToggleCommentary={vi.fn()}
      onToggleSidebar={vi.fn()}
      {...overrides}
    />,
  );
}

describe('Header', () => {
  it('renders connected account and navigation state', () => {
    const markup = renderHeader();

    expect(markup).toContain('id="conn-label"');
    expect(markup).toContain('ONLINE');
    expect(markup).toContain('e2e@example.com');
    expect(markup).toContain('aria-label="Models"');
  });

  it('renders degraded integration and offline states', () => {
    const markup = renderHeader({
      activeTab: 'info',
      activeInfoTab: 'mcp',
      connectionState: 'error',
      integrationWarningCount: 2,
      showCommentary: true,
    });

    expect(markup).toContain('OFFLINE');
    expect(markup).toContain('2 integration issues');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-current="page"');
  });

  it('renders connecting state while the backend initializes', () => {
    expect(renderHeader({ connectionState: 'connecting' })).toContain('CONNECTING');
  });
});
