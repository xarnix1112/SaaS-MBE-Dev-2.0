import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface EditableCellProps {
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
}

export function EditableCell({ value, onChange, className }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value === null ? 'NA' : value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    setIsEditing(true);
    setInputValue(value === null ? '' : value.toString());
  };

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = inputValue.trim().toUpperCase();
    if (trimmed === 'NA' || trimmed === '') {
      onChange(null);
    } else {
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num >= 0) {
        onChange(num);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue(value === null ? 'NA' : value.toString());
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full h-full px-2 py-1 text-center bg-card border-none outline-none text-sm font-medium',
          className
        )}
        placeholder="NA"
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'editable-cell px-2 py-2 text-center text-sm font-medium rounded cursor-pointer min-h-[36px] flex items-center justify-center hover:bg-accent/50 transition-colors',
        value === null && 'text-muted-foreground bg-muted/30',
        className
      )}
    >
      {value === null ? 'NA' : `${value}€`}
    </div>
  );
}

