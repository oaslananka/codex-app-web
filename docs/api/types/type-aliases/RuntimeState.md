[**codex-app-web Protocol API**](../../README.md)

***

[codex-app-web Protocol API](../../README.md) / [types](../README.md) / RuntimeState

# Type Alias: RuntimeState

> **RuntimeState** = [`RuntimeSnapshot`](RuntimeSnapshot.md) & `object`

Defined in: [types.ts:352](https://github.com/oaslananka/codex-app-web/blob/main/src/lib/codex-runtime/types.ts#L352)

## Type Declaration

### configBatchDraft

> **configBatchDraft**: `Record`\<`string`, `unknown`\>

### currentProcId

> **currentProcId**: `string` \| `null`

### fileTreeCache

> **fileTreeCache**: `Record`\<`string`, `object`[]\>

### fileTreeExpanded

> **fileTreeExpanded**: `string`[]

### supportedMethods

> **supportedMethods**: `string`[]

### threadEntries

> **threadEntries**: `Record`\<`string`, [`ChatEntry`](ChatEntry.md)[]\>

### threads

> **threads**: [`ThreadSummary`](ThreadSummary.md)[]

### unsupportedMethods

> **unsupportedMethods**: `string`[]
