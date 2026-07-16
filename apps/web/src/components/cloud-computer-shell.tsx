import { CLOUD_COMPUTER_SHELL_PALETTE, type CloudComputerShellColor } from '@shadowob/shared'
import type { CSSProperties } from 'react'
import './cloud-computer-shell.css'

type CloudComputerShellProps = {
  color: CloudComputerShellColor
  status: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  label?: string
}

export function CloudComputerShell({ color, status, size = 'md', label }: CloudComputerShellProps) {
  const palette = CLOUD_COMPUTER_SHELL_PALETTE[color]
  const style = {
    '--cc-shell': palette.shell,
    '--cc-shell-deep': palette.deep,
    '--cc-shell-glow': palette.glow,
    '--cc-shell-highlight': palette.highlight,
  } as CSSProperties
  const state =
    status === 'deployed' || status === 'ready'
      ? 'ready'
      : status === 'failed' || status === 'error'
        ? 'failed'
        : status === 'paused'
          ? 'paused'
          : 'working'

  return (
    <div
      className="cc-shell"
      data-color={color}
      data-size={size}
      data-state={state}
      style={style}
      role="img"
      aria-label={label}
    >
      <span className="cc-shell__aura" />
      <span className="cc-shell__handle" />
      <span className="cc-shell__body">
        <span className="cc-shell__glass">
          <span className="cc-shell__screen">
            <span className="cc-shell__screen-glow" />
            <svg viewBox="0 0 80 58" aria-hidden="true" className="cc-shell__face">
              <circle cx="29" cy="27" r="2.7" />
              <circle cx="51" cy="27" r="2.7" />
              <path d={state === 'failed' ? 'M27 43 Q40 33 53 43' : 'M27 38 Q40 49 53 38'} />
            </svg>
          </span>
        </span>
        <span className="cc-shell__chin">
          <span className="cc-shell__rainbow" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="cc-shell__vent" />
          <span className="cc-shell__light" />
        </span>
        <span className="cc-shell__shine" />
      </span>
      <span className="cc-shell__foot" />
      <span className="cc-shell__shadow" />
    </div>
  )
}
