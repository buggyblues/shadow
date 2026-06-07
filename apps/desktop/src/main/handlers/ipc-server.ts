import type {
  DesktopIpcProtocol,
  IPCProtocolDefinition,
  IPCServiceDefinition,
  IPCServiceImplementation,
} from '@shadowob/shared'
import {
  desktopIpcProtocol,
  ipcProcedureChannel,
  parseIPCProcedureInput,
  parseIPCProcedureOutput,
} from '@shadowob/shared'
import { type IpcMainInvokeEvent, ipcMain } from 'electron'

export type IPCServerHandler<Context> = (
  input: unknown,
  context: Context,
) => unknown | Promise<unknown>

export interface IPCServerTransport<Context> {
  handle(channel: string, handler: IPCServerHandler<Context>): void
}

export class ElectronIPCServerTransport implements IPCServerTransport<IpcMainInvokeEvent> {
  handle(channel: string, handler: IPCServerHandler<IpcMainInvokeEvent>): void {
    ipcMain.handle(channel, (event, input: unknown) => handler(input, event))
  }
}

export class IPCServer<Protocol extends IPCProtocolDefinition, Context> {
  constructor(
    private readonly protocol: Protocol,
    private readonly transport: IPCServerTransport<Context>,
  ) {}

  registerService<ServiceName extends Extract<keyof Protocol, string>>(
    serviceName: ServiceName,
    implementation: IPCServiceImplementation<Protocol[ServiceName], Context>,
  ): void {
    const service = this.protocol[serviceName]
    if (!service) throw new Error(`Unknown IPC service: ${serviceName}`)
    for (const methodName of Object.keys(service) as Array<Extract<keyof typeof service, string>>) {
      this.registerProcedure(serviceName, methodName, service, implementation)
    }
  }

  private registerProcedure<
    ServiceName extends Extract<keyof Protocol, string>,
    Service extends IPCServiceDefinition,
    MethodName extends Extract<keyof Service, string>,
  >(
    serviceName: ServiceName,
    methodName: MethodName,
    service: Service,
    implementation: IPCServiceImplementation<Service, Context>,
  ): void {
    const procedure = service[methodName]
    const handler = implementation[methodName]
    if (!procedure || !handler) {
      throw new Error(`Unknown IPC procedure: ${String(serviceName)}.${String(methodName)}`)
    }
    this.transport.handle(
      ipcProcedureChannel(serviceName, methodName, procedure),
      async (rawInput, context) => {
        const parsedInput = parseIPCProcedureInput(procedure, rawInput)
        const result = await handler(parsedInput as Parameters<typeof handler>[0], context)
        return parseIPCProcedureOutput(procedure, result)
      },
    )
  }
}

export type DesktopIPCServiceName = Extract<keyof DesktopIpcProtocol, string>

export type DesktopIPCServiceImplementation<ServiceName extends DesktopIPCServiceName> =
  IPCServiceImplementation<DesktopIpcProtocol[ServiceName], IpcMainInvokeEvent>

export function registerDesktopIPCService<ServiceName extends DesktopIPCServiceName>(
  serviceName: ServiceName,
  implementation: DesktopIPCServiceImplementation<ServiceName>,
): void {
  const server = new IPCServer(desktopIpcProtocol, new ElectronIPCServerTransport())
  server.registerService(serviceName, implementation)
}
