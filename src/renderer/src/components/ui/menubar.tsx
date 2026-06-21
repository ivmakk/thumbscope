import * as React from 'react'
import * as MenubarPrimitive from '@radix-ui/react-menubar'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Menubar = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Root ref={ref} className={cn('flex items-center gap-0.5', className)} {...props} />
))
Menubar.displayName = 'Menubar'

export const MenubarMenu = MenubarPrimitive.Menu

export const MenubarTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Trigger
    ref={ref}
    className={cn(
      'select-none rounded-sm px-2 py-1 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent',
      className
    )}
    {...props}
  />
))
MenubarTrigger.displayName = 'MenubarTrigger'

export const MenubarContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>
>(({ className, align = 'start', sideOffset = 4, ...props }, ref) => (
  <MenubarPrimitive.Portal>
    <MenubarPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[10rem] overflow-hidden rounded-md border border-border bg-card p-1 shadow-md',
        className
      )}
      {...props}
    />
  </MenubarPrimitive.Portal>
))
MenubarContent.displayName = 'MenubarContent'

export const MenubarItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Item>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-1 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  />
))
MenubarItem.displayName = 'MenubarItem'

export const MenubarRadioGroup = MenubarPrimitive.RadioGroup

export const MenubarRadioItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <MenubarPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm py-1 pl-7 pr-2 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <MenubarPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5" />
      </MenubarPrimitive.ItemIndicator>
    </span>
    {children}
  </MenubarPrimitive.RadioItem>
))
MenubarRadioItem.displayName = 'MenubarRadioItem'

export const MenubarLabel = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1 text-xs font-medium text-muted-foreground', className)}
    {...props}
  />
))
MenubarLabel.displayName = 'MenubarLabel'

export const MenubarSeparator = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
))
MenubarSeparator.displayName = 'MenubarSeparator'

export function MenubarShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return <span className={cn('ml-auto pl-4 text-xs tracking-widest text-muted-foreground', className)} {...props} />
}
