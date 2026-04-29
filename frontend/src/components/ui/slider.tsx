import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

interface SliderProps extends Omit<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  'value' | 'onValueChange' | 'defaultValue'
> {
  value: number;
  onValueChange: (value: number) => void;
}

const Slider = React.forwardRef<React.ComponentRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className = '', value, onValueChange, 'aria-label': ariaLabel, ...props }, ref) => (
    <SliderPrimitive.Root
      ref={ref}
      className={`relative flex w-full touch-none select-none items-center ${className}`}
      value={[value]}
      onValueChange={(values) => onValueChange(Math.round(values[0] * 1000) / 1000)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-neutral-800">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary-400" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="block h-6 w-6 rounded-full bg-white shadow-md ring-offset-neutral-950 transition-colors focus-visible:outline-2 focus-visible:outline-primary-400 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  )
);
Slider.displayName = 'Slider';

export { Slider };
