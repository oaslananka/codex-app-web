import type {
  AppSummary,
  ChatEntry,
  ExperimentalFeatureSummary,
  FileMetadataSummary,
  McpServerSummary,
  ModelSummary,
  PluginDetailSummary,
  PluginSummary,
  SkillSummary,
  ThreadStatus,
  ThreadSummary,
} from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function joinAbsoluteRootPath(root: unknown, path: unknown) {
  const normalizedPath = String(path ?? '')
    .replace(/\\/g, '/')
    .trim();
  if (!normalizedPath) return '';
  if (normalizedPath.startsWith('/') || /^[A-Za-z]:($|\/)/.test(normalizedPath)) {
    return normalizedPath;
  }

  const normalizedRoot = String(root ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .trim();
  if (!normalizedRoot) {
    return normalizedPath;
  }

  return `${normalizedRoot}/${normalizedPath.replace(/^\.?\//, '')}`.replace(/\/+/g, '/');
}

function normalizeSandboxModeValue(value: unknown) {
  if (typeof value === 'string') return value;
  const policy = asRecord(value);
  switch (policy.type) {
    case 'dangerFullAccess':
      return 'danger-full-access';
    case 'workspaceWrite':
      return 'workspace-write';
    case 'readOnly':
      return 'read-only';
    default:
      return '';
  }
}

export function normalizeThreadSessionSettings(response: unknown) {
  const value = asRecord(response);
  return {
    selectedModel: typeof value.model === 'string' ? value.model : '',
    selectedEffort: typeof value.reasoningEffort === 'string' ? value.reasoningEffort : '',
    selectedServiceTier: typeof value.serviceTier === 'string' ? value.serviceTier : '',
    selectedSandboxMode: normalizeSandboxModeValue(value.sandbox),
  };
}

export function normalizeThread(thread: unknown): ThreadSummary {
  const value = asRecord(thread);
  const serializedThread = Object.keys(value).length ? JSON.stringify(value) : '';
  const fallbackIdSource = [
    value.threadId,
    value.sessionId,
    value.title,
    value.name,
    value.createdAt,
    value.updatedAt,
    value.cwd,
    value.preview,
    serializedThread,
  ]
    .filter((part) => part != null && String(part).trim() !== '')
    .map((part) => String(part).trim())
    .join('|');
  const normalizedId =
    typeof value.id === 'string' && value.id.trim()
      ? value.id
      : typeof value.threadId === 'string' && value.threadId.trim()
        ? value.threadId
        : typeof value.sessionId === 'string' && value.sessionId.trim()
          ? value.sessionId
          : fallbackIdSource
            ? `thread:${fallbackIdSource}`
            : 'thread:unknown';

  return {
    id: normalizedId,
    title:
      typeof value.title === 'string'
        ? value.title
        : typeof value.name === 'string'
          ? value.name
          : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    preview: typeof value.preview === 'string' ? value.preview : undefined,
    createdAt: (value.createdAt ?? value.updatedAt) as string | number | undefined,
    updatedAt: value.updatedAt as string | number | undefined,
    archived: Boolean(value.archived),
    cwd: typeof value.cwd === 'string' ? value.cwd : undefined,
    status: normalizeThreadStatus(value.status),
  };
}

export function normalizeThreadStatus(status: unknown): ThreadStatus {
  const value = asRecord(status);
  return {
    type: typeof value.type === 'string' ? value.type : 'idle',
    activeFlags: asArray<string>(value.activeFlags),
  };
}

export function normalizeThreadsResponse(response: unknown) {
  const value = asRecord(response);
  const seenIds = new Map<string, number>();
  return asArray(value.data ?? value.threads).map((thread) => {
    const normalized = normalizeThread(thread);
    const duplicateCount = seenIds.get(normalized.id) ?? 0;
    seenIds.set(normalized.id, duplicateCount + 1);
    if (duplicateCount === 0) {
      return normalized;
    }

    return {
      ...normalized,
      id: `${normalized.id}#${duplicateCount + 1}`,
    };
  });
}

export function normalizeThreadEntries(response: unknown, activeThreadId: string | null) {
  const value = asRecord(response);
  const thread = asRecord(value.thread);
  const turns = asArray(thread.turns ?? value.turns);
  const items = turns.flatMap((turn) => asArray(asRecord(turn).items));
  return items.map((item) => normalizeChatEntry(item, activeThreadId ?? undefined));
}

export function normalizeModelList(response: unknown): ModelSummary[] {
  const value = asRecord(response);
  return asArray(value.data ?? value.models).map((model) => {
    const item = asRecord(model);
    const supportedReasoningEfforts = asArray(item.supportedReasoningEfforts)
      .map((effortOption) => {
        const option = asRecord(effortOption);
        if (typeof option.reasoningEffort === 'string') return option.reasoningEffort;
        if (typeof effortOption === 'string') return effortOption;
        return '';
      })
      .filter(Boolean);
    return {
      id: String(item.id ?? ''),
      displayName: typeof item.displayName === 'string' ? item.displayName : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      isDefault: Boolean(item.isDefault),
      hidden: Boolean(item.hidden),
      supportedReasoningEfforts,
      defaultReasoningEffort:
        typeof item.defaultReasoningEffort === 'string' ? item.defaultReasoningEffort : null,
    };
  });
}

export function normalizeMcpServers(response: unknown): McpServerSummary[] {
  const value = asRecord(response);
  return asArray(value.servers ?? value.data).map((server) => {
    const item = asRecord(server);
    return {
      id: typeof item.id === 'string' ? item.id : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
      command: typeof item.command === 'string' ? item.command : undefined,
      url: typeof item.url === 'string' ? item.url : undefined,
    };
  });
}

export function normalizeSkills(response: unknown): SkillSummary[] {
  const value = asRecord(response);
  return asArray(value.skills ?? value.data).map((skill) => {
    const item = asRecord(skill);
    return {
      id: typeof item.id === 'string' ? item.id : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    };
  });
}

export function normalizeExperimentalFeatures(response: unknown): ExperimentalFeatureSummary[] {
  const value = asRecord(response);
  return asArray(value.features ?? value.data).map((feature) => {
    const item = asRecord(feature);
    return {
      id: typeof item.id === 'string' ? item.id : undefined,
      key:
        typeof item.key === 'string'
          ? item.key
          : typeof item.name === 'string'
            ? item.name
            : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      displayName: typeof item.displayName === 'string' ? item.displayName : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      stage: typeof item.stage === 'string' ? item.stage : undefined,
      defaultEnabled: typeof item.defaultEnabled === 'boolean' ? item.defaultEnabled : undefined,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined,
      value: typeof item.value === 'boolean' ? item.value : undefined,
    };
  });
}

export function normalizePluginList(response: unknown): PluginSummary[] {
  const value = asRecord(response);
  const marketplaces = asArray(value.marketplaces ?? value.data);
  if (marketplaces.length > 0) {
    return marketplaces.flatMap((marketplace) => {
      const market = asRecord(marketplace);
      return asArray(market.plugins).map((plugin) => {
        const item = asRecord(plugin);
        return {
          id: typeof item.id === 'string' ? item.id : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          version: typeof item.version === 'string' ? item.version : undefined,
          description: typeof item.description === 'string' ? item.description : undefined,
          enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined,
          installed: typeof item.installed === 'boolean' ? item.installed : true,
          marketplaceName: typeof market.name === 'string' ? market.name : undefined,
          marketplacePath: typeof market.path === 'string' ? market.path : undefined,
        };
      });
    });
  }

  return asArray(value.plugins ?? value.data).map((plugin) => {
    const item = asRecord(plugin);
    return {
      id: typeof item.id === 'string' ? item.id : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      version: typeof item.version === 'string' ? item.version : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined,
      installed: typeof item.installed === 'boolean' ? item.installed : true,
    };
  });
}

export function normalizePluginDetail(response: unknown): PluginDetailSummary | null {
  const value = asRecord(response);
  const plugin = asRecord(value.plugin);
  if (!plugin.summary) return null;
  const summary = asRecord(plugin.summary);
  return {
    id: String(summary.id ?? summary.name ?? ''),
    name: String(summary.name ?? summary.id ?? ''),
    description: typeof plugin.description === 'string' ? plugin.description : '',
    apps: asArray(plugin.apps).map((app) => {
      const item = asRecord(app);
      return {
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        description: typeof item.description === 'string' ? item.description : null,
        installUrl: typeof item.installUrl === 'string' ? item.installUrl : null,
      };
    }),
    skills: normalizeSkills({ skills: plugin.skills }),
    mcpServers: asArray<string>(plugin.mcpServers),
  };
}

export function normalizeApps(response: unknown): AppSummary[] {
  const value = asRecord(response);
  return asArray(value.data ?? value.apps).map((app) => {
    const item = asRecord(app);
    return {
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      description: typeof item.description === 'string' ? item.description : null,
      installUrl: typeof item.installUrl === 'string' ? item.installUrl : null,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : null,
      connected: typeof item.connected === 'boolean' ? item.connected : null,
      version: typeof item.version === 'string' ? item.version : null,
      developer: typeof item.developer === 'string' ? item.developer : null,
    };
  });
}

export function normalizeChatEntry(item: unknown, threadId?: string): ChatEntry {
  const value = asRecord(item);
  const type = String(value.type ?? '');
  const id = String(value.id ?? `entry-${Math.random().toString(16).slice(2)}`);
  const createdAt = value.createdAt as string | number | undefined;
  const attachments = getAttachmentPreviews(value);

  if (type === 'userMessage' || value.role === 'user') {
    return {
      id,
      threadId,
      kind: 'message',
      role: 'user',
      createdAt,
      content: getTextContent(value),
      attachments,
      status: 'done',
    };
  }

  if (type === 'agentMessage' || value.role === 'assistant') {
    const phase = typeof value.phase === 'string' ? value.phase : 'assistant';
    return {
      id,
      threadId,
      kind: 'message',
      role: phase === 'commentary' ? 'commentary' : 'assistant',
      phase,
      createdAt,
      content: getTextContent(value),
      attachments,
      status: 'done',
    };
  }

  if (type.includes('reasoning')) {
    return {
      id,
      threadId,
      kind: 'reasoning',
      title: 'Reasoning',
      label: 'Reasoning',
      createdAt,
      content: getOutputText(value),
      status: 'done',
      isCollapsible: true,
    };
  }

  return {
    id,
    threadId,
    kind: 'tool',
    title: type || 'item',
    label: getItemLabel(value),
    createdAt,
    content: getOutputText(value),
    status: 'done',
    isCollapsible: true,
  };
}

export function getTextContent(item: Record<string, unknown>) {
  if (typeof item.text === 'string' && item.text) return item.text;
  if (typeof item.content === 'string') return item.content;
  if (Array.isArray(item.content)) {
    return item.content
      .map((contentItem) => {
        const entry = asRecord(contentItem);
        if (entry.type === 'text' && typeof entry.text === 'string') return entry.text;
        if (typeof entry.content === 'string') return entry.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function getImagePreviewUrl(item: Record<string, unknown>) {
  if (typeof item.imageUrl === 'string' && item.imageUrl) return item.imageUrl;
  if (typeof item.image_url === 'string' && item.image_url) return item.image_url;
  if (typeof item.url === 'string' && item.url) return item.url;
  if (typeof item.src === 'string' && item.src) return item.src;

  const nestedImage = asRecord(item.image ?? item.file ?? item.asset);
  if (typeof nestedImage.url === 'string' && nestedImage.url) return nestedImage.url;
  if (typeof nestedImage.src === 'string' && nestedImage.src) return nestedImage.src;

  const mimeType =
    typeof item.mimeType === 'string'
      ? item.mimeType
      : typeof nestedImage.mimeType === 'string'
        ? nestedImage.mimeType
        : '';
  const base64Payload =
    typeof item.dataBase64 === 'string'
      ? item.dataBase64
      : typeof item.base64 === 'string'
        ? item.base64
        : typeof nestedImage.dataBase64 === 'string'
          ? nestedImage.dataBase64
          : typeof nestedImage.base64 === 'string'
            ? nestedImage.base64
            : '';

  if (mimeType.startsWith('image/') && base64Payload) {
    return `data:${mimeType};base64,${base64Payload}`;
  }

  return '';
}

export function getAttachmentPreviews(
  item: Record<string, unknown>,
): Array<{ name: string; mimeType?: string; previewUrl?: string }> {
  if (!Array.isArray(item.content)) return [];

  const attachments: Array<{ name: string; mimeType?: string; previewUrl?: string } | null> =
    item.content.map((contentItem, index) => {
      const entry = asRecord(contentItem);
      const type = String(entry.type ?? '').toLowerCase();
      const mimeType =
        typeof entry.mimeType === 'string'
          ? entry.mimeType
          : typeof asRecord(entry.image ?? entry.file).mimeType === 'string'
            ? String(asRecord(entry.image ?? entry.file).mimeType)
            : undefined;
      const previewUrl = getImagePreviewUrl(entry);
      const isImageLike =
        type.includes('image') ||
        mimeType?.startsWith('image/') ||
        Boolean(previewUrl && /^data:image\/|^https?:\/\/|^blob:|^\//.test(previewUrl));

      if (!isImageLike || !previewUrl) {
        return null;
      }

      return {
        name:
          typeof entry.name === 'string' && entry.name
            ? entry.name
            : typeof entry.alt === 'string' && entry.alt
              ? entry.alt
              : `Image ${index + 1}`,
        mimeType,
        previewUrl,
      };
    });

  return attachments.filter(
    (attachment): attachment is { name: string; mimeType?: string; previewUrl?: string } =>
      attachment !== null,
  );
}

export function getOutputText(item: Record<string, unknown>) {
  if (typeof item.aggregatedOutput === 'string' && item.aggregatedOutput)
    return item.aggregatedOutput;
  if (typeof item.output === 'string' && item.output) return item.output;
  if (typeof item.result === 'string' && item.result) return item.result;
  if (Array.isArray(item.summary))
    return item.summary.filter((entry) => typeof entry === 'string').join('\n');
  return getTextContent(item);
}

export function getItemLabel(item: Record<string, unknown>) {
  return String(item.command ?? item.path ?? item.toolName ?? item.name ?? item.type ?? 'item');
}

export function normalizeFileEntries(response: unknown, rootPath = '') {
  const value = asRecord(response);
  return asArray(value.entries).map((entry) => {
    const item = asRecord(entry);
    const entryName = String(item.fileName ?? item.name ?? item.path ?? '');
    return {
      name: entryName.split('/').filter(Boolean).pop() || entryName,
      path: joinAbsoluteRootPath(rootPath, item.path ?? item.filePath ?? entryName),
      type: item.type === 'directory' || item.isDirectory === true ? 'directory' : 'file',
    } as const;
  });
}

export function normalizeFileContent(response: unknown) {
  const value = asRecord(response);
  if (typeof value.dataBase64 === 'string') return value.dataBase64;
  if (typeof value.content === 'string') return value.content;
  if (typeof value.data === 'string') return value.data;
  return '';
}

export function normalizeFileMetadata(response: unknown): FileMetadataSummary | null {
  const value = asRecord(response);
  if (!value.path && !value.type && value.size == null) return null;
  return {
    path: String(value.path ?? ''),
    type: typeof value.type === 'string' ? value.type : undefined,
    size: typeof value.size === 'number' ? value.size : null,
    modifiedAt: (value.modifiedAt ?? value.mtime ?? null) as string | number | null,
    createdAt: (value.createdAt ?? value.ctime ?? null) as string | number | null,
    readOnly: typeof value.readOnly === 'boolean' ? value.readOnly : null,
  };
}

export function normalizeFuzzyResults(response: unknown) {
  const value = asRecord(response);
  return asArray(value.results ?? value.files ?? value.data).map((result) => {
    const item = asRecord(result);
    return {
      path: joinAbsoluteRootPath(item.root, item.path ?? item.filePath),
      score: typeof item.score === 'number' ? item.score : undefined,
      preview: typeof item.preview === 'string' ? item.preview : undefined,
    };
  });
}
