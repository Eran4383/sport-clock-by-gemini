import React, { useRef, useEffect } from 'react';

interface HoverNumberInputProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  title?: string;
  placeholder?: string;
  id?: string;
}

export const HoverNumberInput: React.FC<HoverNumberInputProps> = ({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  className = '',
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const input = e.currentTarget as HTMLInputElement;
      if (document.activeElement === input) {
        input.blur();
      }
      
      const delta = e.deltaY > 0 ? -step : step;
      const currentValue = Number(value) || 0;
      let newValue = currentValue + delta;

      if (min !== -Infinity) newValue = Math.max(min, newValue);
      if (max !== Infinity) newValue = Math.min(max, newValue);
      
      onChange(newValue);
    };

    const element = inputRef.current;
    if (element) {
      element.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (element) {
        element.removeEventListener('wheel', handleWheel);
      }
    };
  }, [value, onChange, min, max, step]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const numValue = parseInt(e.target.value, 10);
      if (!isNaN(numValue)) {
          let clampedValue = numValue;
          if (min !== -Infinity) clampedValue = Math.max(min, clampedValue);
          if (max !== Infinity) clampedValue = Math.min(max, clampedValue);
          onChange(clampedValue);
      } else if (e.target.value === '') {
          onChange(min !== -Infinity ? min : 0);
      }
  };

  return (
    <input
      ref={inputRef}
      type="number"
      value={value}
      onChange={handleChange}
      min={min}
      max={max}
      className={`[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
      {...props}
    />
  );
};