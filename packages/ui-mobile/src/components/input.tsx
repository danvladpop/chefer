import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@chefer/utils';

export interface InputProps extends TextInputProps {
  className?: string;
}

/** Themed text input — 44pt min height, semantic border/background tokens. */
export function Input({ className, ...props }: InputProps) {
  return (
    <TextInput
      className={cn(
        'h-11 rounded-md border border-input bg-background px-3 text-base text-foreground',
        className,
      )}
      placeholderTextColor="#9ca3af"
      {...props}
    />
  );
}
