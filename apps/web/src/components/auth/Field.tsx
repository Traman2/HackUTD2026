import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Check, Eye, EyeOff } from "lucide-react";

type FieldProps = {
  id: string;
  label: string;
  index: number;
  error?: string;
  valid?: boolean;
  isPassword?: boolean;
  shakeKey: number;
  extra?: ReactNode;
  inputProps: ComponentProps<"input">;
};

export function Field({ id, label, index, error, valid, isPassword, shakeKey, extra, inputProps }: FieldProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);

  useEffect(() => {
    if (!shakeKey || !error) return;
    wrapRef.current?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-7px)" },
        { transform: "translateX(6px)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(2px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 420, easing: "cubic-bezier(.36,.07,.19,.97)" },
    );
    // Only re-run when a new failed submit happens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeKey]);

  const capsHandler = (e: React.KeyboardEvent<HTMLInputElement>) =>
    isPassword && setCaps(e.getModifierState("CapsLock"));

  return (
    <div className="sx-field" style={{ "--i": index } as React.CSSProperties}>
      <label htmlFor={id} className="sx-label">
        {label}
        {isPassword && caps && <span className="sx-caps">Caps Lock is on</span>}
      </label>
      <div ref={wrapRef} className="sx-input-wrap" data-invalid={!!error} data-valid={!!valid && !error}>
        <input
          id={id}
          className="sx-input"
          {...inputProps}
          type={isPassword ? (show ? "text" : "password") : inputProps.type}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onKeyDown={capsHandler}
          onKeyUp={capsHandler}
          onBlur={(e) => {
            setCaps(false);
            inputProps.onBlur?.(e);
          }}
        />
        <span className="sx-tick" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
        {isPassword && (
          <button
            type="button"
            className="sx-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {extra}
      <div className="sx-error-wrap" data-show={!!error}>
        <p id={`${id}-error`} className="sx-error" aria-live="polite">
          {error}
        </p>
      </div>
    </div>
  );
}

export function StrengthMeter({ value }: { value: string }) {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 14) score++;
  if (!value) score = 0;
  const labels = ["", "Weak", "Okay", "Good", "Strong"];
  return (
    <div className="sx-meter" data-score={score} aria-hidden={!value}>
      <div className="sx-meter-bars">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} data-on={score >= n} />
        ))}
      </div>
      <small>{labels[score]}</small>
    </div>
  );
}
