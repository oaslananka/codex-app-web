import type {
  CoverageStatus,
  OfficialNotificationMethod,
  OfficialRequestMethod,
  OfficialServerRequestMethod,
  ProtocolCoverage,
} from './protocol';
import type { CollaborationModeOption, CollaborationModeValue } from './collaboration';

export type ThreadStatus = {
  type: string;
  activeFlags?: string[];
};

export type ThreadSummary = {
  id: string;
  title?: string;
  name?: string;
  preview?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  archived?: boolean;
  cwd?: string;
  status?: ThreadStatus;
};

export type ModelSummary = {
  id: string;
  displayName?: string;
  description?: string;
  isDefault?: boolean;
  hidden?: boolean;
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string | null;
};

export type McpServerSummary = {
  id?: string;
  name?: string;
  status?: string;
  command?: string;
  url?: string;
};

export type SkillSummary = {
  id?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
};

export type ExperimentalFeatureSummary = {
  id?: string;
  key?: string;
  name?: string;
  displayName?: string;
  description?: string;
  stage?: string;
  defaultEnabled?: boolean;
  enabled?: boolean;
  value?: boolean;
};

export type PermissionProfileSummary = {
  network?: unknown;
  fileSystem?: unknown;
};

export type PluginSummary = {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  enabled?: boolean;
  installed?: boolean;
  marketplaceName?: string;
  marketplacePath?: string;
};

export type PluginDetailSummary = {
  id: string;
  name: string;
  description: string;
  apps: Array<{
    id: string;
    name: string;
    description?: string | null;
    installUrl?: string | null;
  }>;
  skills: SkillSummary[];
  mcpServers: string[];
};

export type AppSummary = {
  id: string;
  name: string;
  description?: string | null;
  installUrl?: string | null;
  enabled?: boolean | null;
  connected?: boolean | null;
  version?: string | null;
  developer?: string | null;
};

export type IntegrationWarningSource =
  | 'mcp'
  | 'apps'
  | 'plugins'
  | 'skills'
  | 'features'
  | 'config';

export type IntegrationWarningContext = 'info' | 'config';

export type IntegrationWarning = {
  id: string;
  context: IntegrationWarningContext;
  source: IntegrationWarningSource;
  message: string;
};

export type PendingAttachmentSummary = {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  path?: string;
  previewUrl?: string;
  status: 'uploading' | 'ready';
};

export type FileBreadcrumbSegment = {
  label: string;
  path: string;
};

export type FileTreeNode = {
  path: string;
  name: string;
  type: 'directory' | 'file';
  depth: number;
  expanded?: boolean;
  selected: boolean;
  isRoot?: boolean;
};

export type FileMetadataSummary = {
  path: string;
  type?: string;
  size?: number | null;
  modifiedAt?: string | number | null;
  createdAt?: string | number | null;
  readOnly?: boolean | null;
};

export type TerminalOutputLine = {
  id: string;
  channel: string;
  text: string;
};

export type CapabilityState = {
  requests: Record<OfficialRequestMethod, CoverageStatus>;
  notifications: Record<OfficialNotificationMethod, CoverageStatus>;
  serverRequests: Record<OfficialServerRequestMethod, CoverageStatus>;
};

export type ApprovalVariant =
  | 'command'
  | 'file'
  | 'permissions'
  | 'user-input'
  | 'mcp'
  | 'tool-call'
  | 'patch'
  | 'auth-refresh';

export type ApprovalQuestion = {
  id: string;
  header?: string;
  question: string;
  required?: boolean;
  type?: 'text' | 'select';
  isOther?: boolean;
  isSecret?: boolean;
  options?: Array<{
    label: string;
    description?: string;
  }>;
};

export type ApprovalRequestState = {
  requestId: string;
  method: string;
  variant: ApprovalVariant;
  title: string;
  badge: string;
  detail: string;
  confirmLabel: string;
  alternateLabel?: string;
  denyLabel?: string;
  needsTextInput?: boolean;
  textInputLabel?: string;
  textInputPlaceholder?: string;
  questions?: ApprovalQuestion[];
  authFields?: boolean;
  availableDecisions?: unknown[];
  commandActions?: Array<Record<string, unknown>>;
  networkApprovalContext?: Record<string, unknown> | null;
  additionalPermissions?: PermissionProfileSummary | null;
  proposedExecpolicyAmendment?: Record<string, unknown> | null;
  proposedNetworkPolicyAmendments?: Array<Record<string, unknown>>;
  requestedPermissions?: PermissionProfileSummary | null;
};

export type ChatEntryKind = 'message' | 'tool' | 'reasoning' | 'system';
export type ChatEntryRole = 'user' | 'assistant' | 'commentary' | 'system';

export type ChatEntry = {
  id: string;
  kind: ChatEntryKind;
  role?: ChatEntryRole;
  threadId?: string;
  turnId?: string;
  title?: string;
  label?: string;
  phase?: string;
  status?: 'running' | 'done' | 'error' | 'waiting';
  content: string;
  attachments?: Array<{
    name: string;
    mimeType?: string;
    previewUrl?: string;
  }>;
  createdAt?: string | number;
  isStreaming?: boolean;
  isCollapsible?: boolean;
};

export type WorkspaceSummary = {
  content: string;
  source: 'thread' | 'cwd' | 'idle';
  loading: boolean;
  error: string;
};

export type FuzzySearchState = {
  query: string;
  loading: boolean;
  error: string;
  results: Array<{ path: string; score?: number; preview?: string }>;
};

export type ReviewState = {
  loading: boolean;
  error: string;
  reviewThreadId: string | null;
};

export type AuthStatusState = {
  content: string;
  loading: boolean;
  error: string;
};

export type ExternalAgentState = {
  loading: boolean;
  error: string;
  items: unknown[];
  importedCount: number;
};

export type RuntimeSnapshot = {
  connected: boolean;
  connectionState: string;
  connectionError: string;
  activeThreadId: string | null;
  activeTab: 'chat' | 'terminal' | 'files' | 'config' | 'info';
  activeFilter: string;
  searchTerm: string;
  visibleThreads: ThreadSummary[];
  activeThread: ThreadSummary | null;
  activeThreadStatus: ThreadStatus;
  loggedIn: boolean;
  loginInProgress: boolean;
  accountEmail: string;
  accountPlan: string;
  showCommentary: boolean;
  pendingAttachments: PendingAttachmentSummary[];
  attachmentUploadInProgress: boolean;
  turnActive: boolean;
  collaborationMode: CollaborationModeValue;
  collaborationModes: CollaborationModeOption[];
  messageDraft: string;
  selectedModel: string;
  selectedEffort: string;
  selectedServiceTier: string;
  selectedSandboxMode: string;
  models: ModelSummary[];
  configData: Record<string, unknown> | null;
  configHydrated: boolean;
  configLoading: boolean;
  configError: string;
  integrationWarnings: IntegrationWarning[];
  configMcpServers: McpServerSummary[];
  configRequirements: Record<string, unknown> | null;
  infoHydrated: boolean;
  infoLoading: boolean;
  infoError: string;
  appsHydrated: boolean;
  appsLoading: boolean;
  appsError: string;
  infoMcpServers: McpServerSummary[];
  skills: SkillSummary[];
  experimentalFeatures: ExperimentalFeatureSummary[];
  plugins: PluginSummary[];
  pluginDetail: PluginDetailSummary | null;
  apps: AppSummary[];
  fileBrowserPath: string;
  fileBreadcrumb: FileBreadcrumbSegment[];
  fileTree: FileTreeNode[];
  fileLoading: boolean;
  fileError: string;
  currentFilePath: string | null;
  fileEditorName: string;
  fileEditorContent: string;
  fileEditorReadOnly: boolean;
  fileMetadata: FileMetadataSummary | null;
  terminalCommand: string;
  terminalCwd: string;
  terminalStdin: string;
  terminalOutput: TerminalOutputLine[];
  terminalRunning: boolean;
  terminalSize: { cols: number; rows: number };
  chatEntries: ChatEntry[];
  activeApprovalRequest: ApprovalRequestState | null;
  protocolCoverage: ProtocolCoverage;
  capabilities: CapabilityState;
  workspaceSummary: WorkspaceSummary;
  gitDiff: { content: string; loading: boolean; error: string };
  authStatus: AuthStatusState;
  fuzzySearch: FuzzySearchState;
  review: ReviewState;
  externalAgents: ExternalAgentState;
  connectionBanner: {
    visible: boolean;
    target: string;
    message: string;
  };
};

export type RuntimeState = RuntimeSnapshot & {
  threads: ThreadSummary[];
  threadEntries: Record<string, ChatEntry[]>;
  currentProcId: string | null;
  fileTreeCache: Record<string, Array<{ name: string; path: string; type: 'directory' | 'file' }>>;
  fileTreeExpanded: string[];
  unsupportedMethods: string[];
  supportedMethods: string[];
  configBatchDraft: Record<string, unknown>;
};
