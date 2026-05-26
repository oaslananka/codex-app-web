[**codex-app-web Protocol API**](../../README.md)

***

[codex-app-web Protocol API](../../README.md) / [types](../README.md) / RuntimeSnapshot

# Type Alias: RuntimeSnapshot

> **RuntimeSnapshot** = `object`

Defined in: [types.ts:273](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L273)

## Properties

### accountEmail

> **accountEmail**: `string`

Defined in: [types.ts:286](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L286)

***

### accountPlan

> **accountPlan**: `string`

Defined in: [types.ts:287](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L287)

***

### activeApprovalRequest

> **activeApprovalRequest**: [`ApprovalRequestState`](ApprovalRequestState.md) \| `null`

Defined in: [types.ts:336](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L336)

***

### activeFilter

> **activeFilter**: `string`

Defined in: [types.ts:279](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L279)

***

### activeTab

> **activeTab**: `"chat"` \| `"terminal"` \| `"files"` \| `"config"` \| `"info"`

Defined in: [types.ts:278](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L278)

***

### activeThread

> **activeThread**: [`ThreadSummary`](ThreadSummary.md) \| `null`

Defined in: [types.ts:282](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L282)

***

### activeThreadId

> **activeThreadId**: `string` \| `null`

Defined in: [types.ts:277](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L277)

***

### activeThreadStatus

> **activeThreadStatus**: [`ThreadStatus`](ThreadStatus.md)

Defined in: [types.ts:283](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L283)

***

### apps

> **apps**: [`AppSummary`](AppSummary.md)[]

Defined in: [types.ts:318](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L318)

***

### appsError

> **appsError**: `string`

Defined in: [types.ts:312](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L312)

***

### appsHydrated

> **appsHydrated**: `boolean`

Defined in: [types.ts:310](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L310)

***

### appsLoading

> **appsLoading**: `boolean`

Defined in: [types.ts:311](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L311)

***

### attachmentUploadInProgress

> **attachmentUploadInProgress**: `boolean`

Defined in: [types.ts:290](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L290)

***

### authStatus

> **authStatus**: [`AuthStatusState`](AuthStatusState.md)

Defined in: [types.ts:341](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L341)

***

### capabilities

> **capabilities**: [`CapabilityState`](CapabilityState.md)

Defined in: [types.ts:338](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L338)

***

### chatEntries

> **chatEntries**: [`ChatEntry`](ChatEntry.md)[]

Defined in: [types.ts:335](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L335)

***

### collaborationMode

> **collaborationMode**: [`CollaborationModeValue`](../../collaboration/type-aliases/CollaborationModeValue.md)

Defined in: [types.ts:292](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L292)

***

### collaborationModes

> **collaborationModes**: [`CollaborationModeOption`](../../collaboration/type-aliases/CollaborationModeOption.md)[]

Defined in: [types.ts:293](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L293)

***

### configData

> **configData**: `Record`\<`string`, `unknown`\> \| `null`

Defined in: [types.ts:300](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L300)

***

### configError

> **configError**: `string`

Defined in: [types.ts:303](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L303)

***

### configHydrated

> **configHydrated**: `boolean`

Defined in: [types.ts:301](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L301)

***

### configLoading

> **configLoading**: `boolean`

Defined in: [types.ts:302](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L302)

***

### configMcpServers

> **configMcpServers**: [`McpServerSummary`](McpServerSummary.md)[]

Defined in: [types.ts:305](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L305)

***

### configRequirements

> **configRequirements**: `Record`\<`string`, `unknown`\> \| `null`

Defined in: [types.ts:306](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L306)

***

### connected

> **connected**: `boolean`

Defined in: [types.ts:274](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L274)

***

### connectionBanner

> **connectionBanner**: `object`

Defined in: [types.ts:345](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L345)

#### message

> **message**: `string`

#### target

> **target**: `string`

#### visible

> **visible**: `boolean`

***

### connectionError

> **connectionError**: `string`

Defined in: [types.ts:276](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L276)

***

### connectionState

> **connectionState**: `string`

Defined in: [types.ts:275](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L275)

***

### currentFilePath

> **currentFilePath**: `string` \| `null`

Defined in: [types.ts:324](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L324)

***

### experimentalFeatures

> **experimentalFeatures**: [`ExperimentalFeatureSummary`](ExperimentalFeatureSummary.md)[]

Defined in: [types.ts:315](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L315)

***

### externalAgents

> **externalAgents**: [`ExternalAgentState`](ExternalAgentState.md)

Defined in: [types.ts:344](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L344)

***

### fileBreadcrumb

> **fileBreadcrumb**: [`FileBreadcrumbSegment`](FileBreadcrumbSegment.md)[]

Defined in: [types.ts:320](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L320)

***

### fileBrowserPath

> **fileBrowserPath**: `string`

Defined in: [types.ts:319](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L319)

***

### fileEditorContent

> **fileEditorContent**: `string`

Defined in: [types.ts:326](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L326)

***

### fileEditorName

> **fileEditorName**: `string`

Defined in: [types.ts:325](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L325)

***

### fileEditorReadOnly

> **fileEditorReadOnly**: `boolean`

Defined in: [types.ts:327](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L327)

***

### fileError

> **fileError**: `string`

Defined in: [types.ts:323](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L323)

***

### fileLoading

> **fileLoading**: `boolean`

Defined in: [types.ts:322](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L322)

***

### fileMetadata

> **fileMetadata**: [`FileMetadataSummary`](FileMetadataSummary.md) \| `null`

Defined in: [types.ts:328](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L328)

***

### fileTree

> **fileTree**: [`FileTreeNode`](FileTreeNode.md)[]

Defined in: [types.ts:321](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L321)

***

### fuzzySearch

> **fuzzySearch**: [`FuzzySearchState`](FuzzySearchState.md)

Defined in: [types.ts:342](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L342)

***

### gitDiff

> **gitDiff**: `object`

Defined in: [types.ts:340](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L340)

#### content

> **content**: `string`

#### error

> **error**: `string`

#### loading

> **loading**: `boolean`

***

### infoError

> **infoError**: `string`

Defined in: [types.ts:309](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L309)

***

### infoHydrated

> **infoHydrated**: `boolean`

Defined in: [types.ts:307](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L307)

***

### infoLoading

> **infoLoading**: `boolean`

Defined in: [types.ts:308](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L308)

***

### infoMcpServers

> **infoMcpServers**: [`McpServerSummary`](McpServerSummary.md)[]

Defined in: [types.ts:313](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L313)

***

### integrationWarnings

> **integrationWarnings**: [`IntegrationWarning`](IntegrationWarning.md)[]

Defined in: [types.ts:304](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L304)

***

### loggedIn

> **loggedIn**: `boolean`

Defined in: [types.ts:284](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L284)

***

### loginInProgress

> **loginInProgress**: `boolean`

Defined in: [types.ts:285](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L285)

***

### messageDraft

> **messageDraft**: `string`

Defined in: [types.ts:294](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L294)

***

### models

> **models**: [`ModelSummary`](ModelSummary.md)[]

Defined in: [types.ts:299](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L299)

***

### pendingAttachments

> **pendingAttachments**: [`PendingAttachmentSummary`](PendingAttachmentSummary.md)[]

Defined in: [types.ts:289](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L289)

***

### pluginDetail

> **pluginDetail**: [`PluginDetailSummary`](PluginDetailSummary.md) \| `null`

Defined in: [types.ts:317](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L317)

***

### plugins

> **plugins**: [`PluginSummary`](PluginSummary.md)[]

Defined in: [types.ts:316](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L316)

***

### protocolCoverage

> **protocolCoverage**: [`ProtocolCoverage`](../../protocol/type-aliases/ProtocolCoverage.md)

Defined in: [types.ts:337](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L337)

***

### review

> **review**: [`ReviewState`](ReviewState.md)

Defined in: [types.ts:343](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L343)

***

### searchTerm

> **searchTerm**: `string`

Defined in: [types.ts:280](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L280)

***

### selectedEffort

> **selectedEffort**: `string`

Defined in: [types.ts:296](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L296)

***

### selectedModel

> **selectedModel**: `string`

Defined in: [types.ts:295](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L295)

***

### selectedSandboxMode

> **selectedSandboxMode**: `string`

Defined in: [types.ts:298](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L298)

***

### selectedServiceTier

> **selectedServiceTier**: `string`

Defined in: [types.ts:297](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L297)

***

### showCommentary

> **showCommentary**: `boolean`

Defined in: [types.ts:288](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L288)

***

### skills

> **skills**: [`SkillSummary`](SkillSummary.md)[]

Defined in: [types.ts:314](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L314)

***

### terminalCommand

> **terminalCommand**: `string`

Defined in: [types.ts:329](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L329)

***

### terminalCwd

> **terminalCwd**: `string`

Defined in: [types.ts:330](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L330)

***

### terminalOutput

> **terminalOutput**: [`TerminalOutputLine`](TerminalOutputLine.md)[]

Defined in: [types.ts:332](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L332)

***

### terminalRunning

> **terminalRunning**: `boolean`

Defined in: [types.ts:333](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L333)

***

### terminalSize

> **terminalSize**: `object`

Defined in: [types.ts:334](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L334)

#### cols

> **cols**: `number`

#### rows

> **rows**: `number`

***

### terminalStdin

> **terminalStdin**: `string`

Defined in: [types.ts:331](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L331)

***

### turnActive

> **turnActive**: `boolean`

Defined in: [types.ts:291](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L291)

***

### visibleThreads

> **visibleThreads**: [`ThreadSummary`](ThreadSummary.md)[]

Defined in: [types.ts:281](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L281)

***

### workspaceSummary

> **workspaceSummary**: [`WorkspaceSummary`](WorkspaceSummary.md)

Defined in: [types.ts:339](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L339)
