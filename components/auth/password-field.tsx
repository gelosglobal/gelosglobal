'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { authInputClassName, authLabelClassName } from '@/components/auth/auth-field-styles'
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
      <Label htmlFor={id} className={authLabelClassName}>
        {label}
      </Label>
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
          className={cn(authInputClassName, 'pr-12')}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {hint ? (
        <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
