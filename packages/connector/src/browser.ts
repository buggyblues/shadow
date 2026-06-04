export {
  type ConnectorCommand,
  type ConnectorConfigBlock,
  type ConnectorPlan,
  createConnectorPlan,
  createConnectorPlans,
  type ShadowConnectorInput,
  type ShadowConnectorTarget,
} from './index.js'
export type { ConnectorModelProvider as ShadowConnectorModelProvider } from './model-provider.js'
export {
  CONNECTOR_RUNTIME_CATALOG,
  type ConnectorRuntimeCatalogEntry,
  type ConnectorRuntimeId,
  type ConnectorRuntimeInstallSpec,
  type ConnectorRuntimeKind,
  type ConnectorRuntimePlatform,
  connectorRuntimeById,
  connectorRuntimeCatalog,
  connectorRuntimeInstallCommand,
  connectorRuntimeInstallCommands,
} from './runtime-catalog.js'
