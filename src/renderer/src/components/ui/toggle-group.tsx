import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cn } from '@/lib/utils'

export function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn('flex items-center gap-1 rounded-md border border-border p-0.5', className)}
      {...props}
    />
  )
}

export function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1 rounded-sm px-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
        className
      )}
      {...props}
    />
  )
}
