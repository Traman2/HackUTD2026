import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSpacetimeDB } from "spacetimedb/react";
import { Field } from "@/components/auth/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { AuthOutletContext } from "@/components/auth/auth-context";
import { login, loginErrorMessage } from "@/lib/auth";
import { loginSchema, type LoginValues } from "@/lib/validation/login";

export default function Login() {
  const { token, isActive } = useSpacetimeDB();
  const { celebrate } = useOutletContext<AuthOutletContext>();
  const [signedIn, setSignedIn] = useState(false);
  const [shake, setShake] = useState(0);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    resetField,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const values = watch();

  async function onSubmit(data: LoginValues) {
    clearErrors("root");
    setSignedIn(false);
    if (!isActive || !token) {
      setError("root", {
        message:
          "Unable to connect to the sign-in service. Please try again shortly.",
      });
      setShake((s) => s + 1);
      return;
    }
    try {
      await login(data, token);
      resetField("password");
      setSignedIn(true);
      celebrate();
    } catch (error) {
      setError("root", { message: loginErrorMessage(error) });
      setShake((s) => s + 1);
    }
  }

  return (
    <>
      <h2 className="sx-card-title">Welcome back</h2>
      <p className="sx-card-sub">Sign in to monitor your portfolio.</p>
      <form
        onSubmit={handleSubmit(onSubmit, () => setShake((s) => s + 1))}
        onChange={() => {
          clearErrors("root");
          setSignedIn(false);
        }}
        noValidate
        aria-busy={isSubmitting}
      >
        <Field
          id="username"
          label="Username"
          index={0}
          shakeKey={shake}
          error={errors.username?.message}
          valid={loginSchema.shape.username.safeParse(values.username).success && values.username.length > 0}
          inputProps={{
            ...register("username"),
            autoComplete: "username",
            autoCapitalize: "none",
            spellCheck: false,
            required: true,
            readOnly: isSubmitting,
          }}
        />
        <Field
          id="password"
          label="Password"
          index={1}
          isPassword
          shakeKey={shake}
          error={errors.password?.message}
          valid={values.password.length > 0}
          inputProps={{
            ...register("password"),
            autoComplete: "current-password",
            required: true,
            readOnly: isSubmitting,
          }}
        />
        <div className="sx-field" style={{ "--i": 2 } as React.CSSProperties}>
          <SubmitButton
            status={isSubmitting ? "loading" : signedIn ? "success" : "idle"}
            idle="Continue"
            loading="Signing in..."
            success="Signed in"
          />
        </div>
        {errors.root && (
          <p key={shake} role="alert" className="sx-root-error">
            {errors.root.message}
          </p>
        )}
        {signedIn && (
          <p role="status" className="sx-root-ok">
            Signed in successfully.
          </p>
        )}
      </form>
      <p className="sx-switch">
        Don't have an account? <Link to="/signup">Sign up</Link>
      </p>
    </>
  );
}
