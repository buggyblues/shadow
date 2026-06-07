import { z } from 'zod'

export type IPCProcedureDefinition<
  InputSchema extends z.ZodTypeAny | undefined = z.ZodVoid,
  OutputSchema extends z.ZodTypeAny = z.ZodVoid,
> = {
  input: InputSchema
  output: OutputSchema
  channel?: string
}

export type IPCServiceDefinition = Record<
  string,
  IPCProcedureDefinition<z.ZodTypeAny, z.ZodTypeAny>
>
export type IPCProtocolDefinition = Record<string, IPCServiceDefinition>

type AnyIPCProcedureDefinition = IPCProcedureDefinition<z.ZodTypeAny, z.ZodTypeAny>

export type IPCProcedureInput<Procedure extends AnyIPCProcedureDefinition> =
  Procedure['input'] extends z.ZodTypeAny ? z.output<Procedure['input']> : void

export type IPCProcedureArgument<Procedure extends AnyIPCProcedureDefinition> =
  Procedure['input'] extends z.ZodTypeAny ? z.input<Procedure['input']> : void

export type IPCProcedureOutput<Procedure extends AnyIPCProcedureDefinition> =
  Procedure['output'] extends z.ZodTypeAny ? z.output<Procedure['output']> : void

export type IPCProcedureArgs<Procedure extends AnyIPCProcedureDefinition> =
  IPCProcedureArgument<Procedure> extends void ? [] : [IPCProcedureArgument<Procedure>]

export type IPCServiceClient<Service extends IPCServiceDefinition> = {
  [Method in keyof Service]: (
    ...args: IPCProcedureArgs<Service[Method]>
  ) => Promise<IPCProcedureOutput<Service[Method]>>
}

export type IPCClient<Protocol extends IPCProtocolDefinition> = {
  [Service in keyof Protocol]: IPCServiceClient<Protocol[Service]>
}

export type IPCServiceImplementation<Service extends IPCServiceDefinition, Context> = {
  [Method in keyof Service]: (
    input: IPCProcedureInput<Service[Method]>,
    context: Context,
  ) => IPCProcedureOutput<Service[Method]> | Promise<IPCProcedureOutput<Service[Method]>>
}

export type IPCProtocolImplementation<Protocol extends IPCProtocolDefinition, Context> = {
  [Service in keyof Protocol]: IPCServiceImplementation<Protocol[Service], Context>
}

export function ipcProcedure<
  const InputSchema extends z.ZodTypeAny = z.ZodVoid,
  const OutputSchema extends z.ZodTypeAny = z.ZodVoid,
>(
  definition: IPCProcedureDefinition<InputSchema, OutputSchema> = {
    input: ipcVoidInputSchema as InputSchema,
    output: ipcVoidOutputSchema as OutputSchema,
  },
): IPCProcedureDefinition<InputSchema, OutputSchema> {
  return definition
}

export function defineIPCService<const Service extends IPCServiceDefinition>(
  service: Service,
): Service {
  return service
}

export function defineIPCProtocol<const Protocol extends IPCProtocolDefinition>(
  protocol: Protocol,
): Protocol {
  return protocol
}

export function ipcProcedureChannel(
  serviceName: string,
  methodName: string,
  procedure?: Pick<IPCProcedureDefinition<z.ZodTypeAny, z.ZodTypeAny>, 'channel'>,
): string {
  return procedure?.channel ?? `desktop-rpc:${serviceName}.${methodName}`
}

export function parseIPCProcedureInput<Procedure extends AnyIPCProcedureDefinition>(
  procedure: Procedure,
  input: unknown,
): IPCProcedureInput<Procedure> {
  return procedure.input.parse(input) as IPCProcedureInput<Procedure>
}

export function parseIPCProcedureOutput<Procedure extends AnyIPCProcedureDefinition>(
  procedure: Procedure,
  output: unknown,
): IPCProcedureOutput<Procedure> {
  return procedure.output.parse(output) as IPCProcedureOutput<Procedure>
}

export const ipcVoidInputSchema = z.void()
export const ipcVoidOutputSchema = z.void()
