import React, { useRef, useEffect, useState } from 'react';

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
  const [displayValue, setDisplayValue] = useState<string>(value.toString());

  useEffect(() => {
    // Sync display value if parent value changes, but not while the user is typing.
    if (document.activeElement !== inputRef.current) {
      setDisplayValue(value.toString());
    }
  }, [value]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const input = e.currentTarget as HTMLInputElement;
      if (document.activeElement === input) {
        input.blur();
      }
      
      const delta = e.deltaY > 0 ? -step : step;
      // Read from the displayValue in case the user has typed something not yet committed to parent state
      const currentValue = Number(displayValue) || 0;
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
  }, [displayValue, onChange, min, max, step]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Only update the local string value, allowing it to be empty
      setDisplayValue(e.target.value);
  };
  
  const handleBlur = () => {
      const numValue = parseInt(displayValue, 10);
      let finalValue = min !== -Infinity ? min : 0; // Sensible default

      // If parsing was successful, use the parsed number
      if (!isNaN(numValue)) {
          finalValue = numValue;
      }

      // Clamp the value to the min/max range
      if (min !== -Infinity) finalValue = Math.max(min, finalValue);
      if (max !== Infinity) finalValue = Math.min(max, finalValue);
      
      // Update parent and sync local display to the sanitized value
      onChange(finalValue);
      setDisplayValue(finalValue.toString());
  };

  return (
    <input
      ref={inputRef}
      type="number"
      autoComplete="off"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      min={min === -Infinity ? undefined : min}
      max={max === Infinity ? undefined : max}
      className={`[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
      {...props}
    />
  );
};