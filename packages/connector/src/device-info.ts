import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { arch, hostname, platform, release } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ConnectorDeviceClass =
  | 'macbook'
  | 'imac'
  | 'mac-mini'
  | 'mac-studio'
  | 'laptop'
  | 'desktop'
  | 'workstation'
  | 'server'
  | 'unknown'

export interface ConnectorDeviceInfo {
  hostname: string
  os: string
  osVersion: string
  arch: string
  deviceClass: ConnectorDeviceClass
  deviceVendor: string | null
  deviceModel: string | null
  capabilities: string[]
}

function normalized(value: string | null | undefined): string | null {
  const next = value?.replace(/\0/g, '').trim()
  return next || null
}

export function classifyConnectorDevice(input: {
  os: string
  vendor?: string | null
  model?: string | null
  chassisType?: string | number | null
  pcSystemType?: string | number | null
}): ConnectorDeviceClass {
  const model = normalized(input.model)?.toLowerCase() ?? ''
  const vendor = normalized(input.vendor)?.toLowerCase() ?? ''
  if (input.os === 'darwin' || vendor.includes('apple')) {
    if (model.startsWith('macbook')) return 'macbook'
    if (model.startsWith('imac')) return 'imac'
    if (model.startsWith('macmini') || model.includes('mac mini')) return 'mac-mini'
    if (model.startsWith('macstudio') || model.includes('mac studio')) return 'mac-studio'
    if (model.startsWith('macpro') || model.includes('mac pro')) return 'workstation'
  }

  const chassis = Number(input.chassisType)
  if ([8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32].includes(chassis)) return 'laptop'
  if ([17, 23, 28, 29].includes(chassis)) return 'server'
  if ([3, 4, 5, 6, 7, 15, 16, 24, 35, 36].includes(chassis)) return 'desktop'

  const pcSystemType = Number(input.pcSystemType)
  if (pcSystemType === 2) return 'laptop'
  if (pcSystemType === 3) return 'workstation'
  if (pcSystemType === 4 || pcSystemType === 5 || pcSystemType === 7) return 'server'
  if (pcSystemType === 1) return 'desktop'

  if (/book|laptop|notebook|portable/.test(model)) return 'laptop'
  if (/server/.test(model)) return 'server'
  if (/workstation|precision|z\d{1,2}/.test(model)) return 'workstation'
  if (/desktop|tower|optiplex|prodesk|thinkcentre/.test(model)) return 'desktop'
  return 'unknown'
}

async function macDevice() {
  try {
    const { stdout } = await execFileAsync(
      '/usr/sbin/system_profiler',
      ['SPHardwareDataType', '-json'],
      { timeout: 5_000, maxBuffer: 512 * 1024 },
    )
    const payload = JSON.parse(stdout) as {
      SPHardwareDataType?: Array<{ machine_name?: unknown; machine_model?: unknown }>
    }
    const hardware = payload.SPHardwareDataType?.[0]
    const machineName = normalized(
      typeof hardware?.machine_name === 'string' ? hardware.machine_name : null,
    )
    const machineModel = normalized(
      typeof hardware?.machine_model === 'string' ? hardware.machine_model : null,
    )
    return {
      vendor: 'Apple',
      model:
        machineName && machineModel
          ? `${machineName} · ${machineModel}`
          : (machineName ?? machineModel),
      chassisType: null,
      pcSystemType: null,
    }
  } catch {
    const { stdout } = await execFileAsync('/usr/sbin/sysctl', ['-n', 'hw.model'], {
      timeout: 3_000,
    })
    return { vendor: 'Apple', model: normalized(stdout), chassisType: null, pcSystemType: null }
  }
}

async function windowsDevice() {
  const script = [
    '$computer = Get-CimInstance Win32_ComputerSystem',
    '$enclosure = Get-CimInstance Win32_SystemEnclosure',
    '[pscustomobject]@{',
    'Vendor=$computer.Manufacturer;',
    'Model=$computer.Model;',
    'PCSystemType=$computer.PCSystemType;',
    'ChassisType=($enclosure.ChassisTypes | Select-Object -First 1)',
    '} | ConvertTo-Json -Compress',
  ].join(' ')
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    timeout: 5_000,
  })
  const value = JSON.parse(stdout) as Record<string, unknown>
  return {
    vendor: normalized(typeof value.Vendor === 'string' ? value.Vendor : null),
    model: normalized(typeof value.Model === 'string' ? value.Model : null),
    chassisType: typeof value.ChassisType === 'number' ? value.ChassisType : null,
    pcSystemType: typeof value.PCSystemType === 'number' ? value.PCSystemType : null,
  }
}

async function readLinuxDmi(name: string): Promise<string | null> {
  return readFile(`/sys/class/dmi/id/${name}`, 'utf8')
    .then(normalized)
    .catch(() => null)
}

async function linuxDevice() {
  const [vendor, model, chassisType] = await Promise.all([
    readLinuxDmi('sys_vendor'),
    readLinuxDmi('product_name'),
    readLinuxDmi('chassis_type'),
  ])
  return { vendor, model, chassisType, pcSystemType: null }
}

export async function detectConnectorDeviceInfo(): Promise<ConnectorDeviceInfo> {
  const os = platform()
  const detected = await (os === 'darwin'
    ? macDevice()
    : os === 'win32'
      ? windowsDevice()
      : os === 'linux'
        ? linuxDevice()
        : Promise.resolve({ vendor: null, model: null, chassisType: null, pcSystemType: null })
  ).catch(() => ({ vendor: null, model: null, chassisType: null, pcSystemType: null }))

  return {
    hostname: hostname(),
    os,
    osVersion: release(),
    arch: arch(),
    deviceClass: classifyConnectorDevice({ os, ...detected }),
    deviceVendor: detected.vendor,
    deviceModel: detected.model,
    capabilities: ['buddies', 'runtimes', 'tasks', 'diagnostics'],
  }
}
