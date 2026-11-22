import { useTranslation } from "react-i18next"
import * as React from "react"
import { cn } from "cn"

function validationKey(input: HTMLInputElement) {
  if (input.validity.valueMissing) return "ui:fieldRequired"
  if (input.type === "email" && input.validity.typeMismatch) return "ui:invalidEmail"
  return "ui:invalidValue"
}

function Input({ className, type, onInvalid, onInput, ...props }: React.ComponentProps<"input">) {
  const { t } = useTranslation()
  const invalidInput = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    const input = invalidInput.current
    if (!input) return
    input.setCustomValidity("")
    if (!input.validity.valid) input.setCustomValidity(t(validationKey(input)))
  }, [t])

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
      onInvalid={(event) => {
        const input = event.currentTarget
        input.setCustomValidity("")
        invalidInput.current = input
        if (!input.validity.valid) input.setCustomValidity(t(validationKey(input)))
        onInvalid?.(event)
      }}
      onInput={(event) => {
        invalidInput.current = null
        event.currentTarget.setCustomValidity("")
        onInput?.(event)
      }}
    />
  )
}

export { Input }
