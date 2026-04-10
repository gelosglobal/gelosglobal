'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type PasswordFieldProps = {
  id?: string
  label: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  minLength?: number
  hint?: string
  className?: string
}

export function PasswordField({
  id: idProp,
  label,
  autoComplete,
  value,
  onChange,
  disabled,
  required,
  minLength,
  hint,
  className,
}: PasswordFieldProps) {
  const uid = useId()
  const id = idProp ?? `password-${uid}`
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-foreground">
          {label}
        </Label>
      </div>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          minLength={minLength}
          className="h-11 pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {hint ? (
        <p className="text-xs text-muted-foreground leading-snug">{hint}</p>
      ) : null}
    </div>
  )
}
