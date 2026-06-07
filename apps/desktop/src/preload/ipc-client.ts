import type {
  IPCClient,
  IPCProcedureArgs,
  IPCProcedureOutput,
  IPCProtocolDefinition,
  IPCServiceClient,
  IPCServiceDefinition,
} from '@shadowob/shared'
import {
  ipcProcedureChannel,
  parseIPCProcedureInput,
  parseIPCProcedureOutput,
} from '@shadowob/shared'
import { ipcRenderer } from 'electron'

export interface IPCClientTransport {
  invoke(channel: string, input: unknown): Promise<unknown>
}

export class ElectronIPCClientTransport implements IPCClientTransport {
  invoke(channel: string, input: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channel, input)
  }
}

export function createIPCClient<Protocol extends IPCProtocolDefinition>(
  protocol: Protocol,
  transport: IPCClientTransport,
): IPCClient<Protocol> {
  const client: Record<string, unknown> = {}
  for (const serviceName of Object.keys(protocol) as Array<Extract<keyof Protocol, string>>) {
    const service = protocol[serviceName]
    if (!service) continue
    client[serviceName] = createServiceClient(serviceName, service, transport)
  }
  return client as IPCClient<Protocol>
}

function createServiceClient<Service extends IPCServiceDefinition>(
  serviceName: string,
  service: Service,
  transport: IPCClientTransport,
): IPCServiceClient<Service> {
  const client: Record<string, unknown> = {}
  for (const methodName of Object.keys(service) as Array<Extract<keyof Service, string>>) {
    const procedure = service[methodName] as Service[typeof methodName]
    if (!procedure) continue
    client[methodName] = async (...args: IPCProcedureArgs<typeof procedure>) => {
      const rawInput = args[0]
      const input = parseIPCProcedureInput(procedure, rawInput)
      const output = await transport.invoke(
        ipcProcedureChannel(serviceName, methodName, procedure),
        input,
      )
      return parseIPCProcedureOutput(procedure, output) as IPCProcedureOutput<typeof procedure>
    }
  }
  return client as IPCServiceClient<Service>
}
