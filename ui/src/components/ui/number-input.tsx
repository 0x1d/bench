import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface NumberInputProps
  extends Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      value,
      onChange,
      min,
      max,
      step = 1,
      disabled,
      ...props
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value === "" ? 0 : Number(e.target.value)
      onChange(Number.isNaN(v) ? 0 : v)
    }

    const clamp = (v: number) => {
      let result = v
      if (min !== undefined && result < min) result = min
      if (max !== undefined && result > max) result = max
      return result
    }

    const increment = () => onChange(clamp(value + step))
    const decrement = () => onChange(clamp(value - step))

    const canIncrement = max === undefined || value < max
    const canDecrement = min === undefined || value > min

    return (
      <div
        className={cn(
          "relative flex h-9 w-full items-stretch rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
          disabled && "pointer-events-none opacity-50",
          className
        )}
      >
        <Input
          ref={ref}
          type="number"
          value={value}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 pr-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          {...props}
        />
        <div className="absolute right-0 top-0 flex h-full flex-col border-l border-input rounded-r-md overflow-hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="flex-1 min-h-0 rounded-none border-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
            onClick={increment}
            disabled={disabled || !canIncrement}
            tabIndex={-1}
            aria-label="Increment"
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="flex-1 min-h-0 rounded-none border-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
            onClick={decrement}
            disabled={disabled || !canDecrement}
            tabIndex={-1}
            aria-label="Decrement"
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
      </div>
    )
  }
)

NumberInput.displayName = "NumberInput"

export { NumberInput }
