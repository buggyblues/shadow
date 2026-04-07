import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'
import { Dialog, DialogContent } from './dialog'

type CommandComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CommandPrimitive> & React.RefAttributes<HTMLDivElement>
>

const Command: CommandComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>((props, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-[24px] bg-bg-secondary text-text-primary',
      props.className,
    )}
    {...props}
  />
))
Command.displayName = 'Command'

interface CommandDialogProps extends React.ComponentPropsWithoutRef<typeof Dialog> {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group]:not([hidden])~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-14 [&_[cmdk-item]]:px-4 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

type CommandInputComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> &
    React.RefAttributes<HTMLInputElement>
>

const CommandInput: CommandInputComponent = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>((props, ref) => (
  <div className="flex items-center border-b border-border-subtle px-4" cmdk-input-wrapper="">
    <Search className="mr-3 h-4 w-4 shrink-0 opacity-50" strokeWidth={3} />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-md bg-transparent py-3 text-sm font-bold outline-none placeholder:text-text-muted/40 disabled:cursor-not-allowed disabled:opacity-50',
        props.className,
      )}
      {...props}
    />
  </div>
))
CommandInput.displayName = 'CommandInput'

type CommandListComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List> & React.RefAttributes<HTMLDivElement>
>

const CommandList: CommandListComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>((props, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      'max-height-[300px] overflow-y-auto overflow-x-hidden p-2 custom-scrollbar',
      props.className,
    )}
    {...props}
  />
))
CommandList.displayName = 'CommandList'

type CommandEmptyComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<'div'> & React.RefAttributes<HTMLDivElement>
>

const CommandEmpty: CommandEmptyComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>((props, ref) => (
  <div
    ref={ref}
    className={cn(
      'py-10 text-center text-sm font-bold italic text-text-muted opacity-60',
      props.className,
    )}
    {...props}
  />
))
CommandEmpty.displayName = 'CommandEmpty'

type CommandGroupComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group> &
    React.RefAttributes<HTMLDivElement>
>

const CommandGroup: CommandGroupComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>((props, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-text-primary [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-text-muted/50',
      props.className,
    )}
    {...props}
  />
))
CommandGroup.displayName = 'CommandGroup'

type CommandSeparatorComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator> &
    React.RefAttributes<HTMLDivElement>
>

const CommandSeparator: CommandSeparatorComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>((props, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border-subtle opacity-50', props.className)}
    {...props}
  />
))
CommandSeparator.displayName = 'CommandSeparator'

type CommandItemComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & React.RefAttributes<HTMLDivElement>
>

const CommandItem: CommandItemComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>((props, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-xl px-3 py-2.5 text-sm font-bold outline-none aria-selected:bg-primary aria-selected:text-bg-deep data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 transition-all active:scale-[0.98]',
      props.className,
    )}
    {...props}
  />
))
CommandItem.displayName = 'CommandItem'

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        'ml-auto text-[10px] font-black uppercase tracking-widest text-text-muted opacity-40',
        className,
      )}
      {...props}
    />
  )
}
CommandShortcut.displayName = 'CommandShortcut'

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
