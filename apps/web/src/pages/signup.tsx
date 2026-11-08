import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSpacetimeDB } from "spacetimedb/react";
import { Field, StrengthMeter } from "@/components/auth/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { AuthOutletContext } from "@/components/auth/auth-context";
import { signup, signupErrorMessage } from "@/lib/auth";
import { signupSchema, type SignupValues } from "@/lib/validation/signup";

export default function Signup() {
  const { token, isActive } = useSpacetimeDB();
  const { celebrate } = useOutletContext<AuthOutletContext>();
  const [signedUp, setSignedUp] = useState(false);
  const [shake, setShake] = useState(0);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    resetField,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: "", username: "", password: "" },
  });
  const values = watch();

  async function onSubmit(data: SignupValues) {
    clearErrors("root");
    setSignedUp(false);
    if (!isActive || !token) {
      setError("root", {
        message:
          "Unable to connect to the signup service. Please try again shortly.",
      });
      setShake((s) => s + 1);
      return;
    }
    try {
      await signup(data, token);
      resetField("password");
      setSignedUp(true);
      celebrate();
    } catch (error) {
      const message = signupErrorMessage(error);
      setError(message === "Username is already taken." ? "username" : "root", { message }, { shouldFocus: message === "Username is already taken." });
      setShake((s) => s + 1);
    }
  }

  return (
    <>
      <h2 className="sx-card-title">Create your account</h2>
      <p className="sx-card-sub">Start mapping hidden dependencies in minutes.</p>
      <form
        onSubmit={handleSubmit(onSubmit, () => setShake((s) => s + 1))}
        onChange={() => {
          clearErrors("root");
          setSignedUp(false);
        }}
        noValidate
        aria-busy={isSubmitting}
      >
        <Field
          id="displayName"
          label="Display name"
          index={0}
          shakeKey={shake}
          error={errors.displayName?.message}
          valid={values.displayName.length > 0 && signupSchema.shape.displayName.safeParse(values.displayName).success}
          inputProps={{
            ...register("displayName"),
            autoComplete: "nickname",
            required: true,
            readOnly: isSubmitting,
          }}
        />
        <Field
          id="username"
          label="Username"
          index={1}
          shakeKey={shake}
          error={errors.username?.message}
          valid={values.username.length > 0 && signupSchema.shape.username.safeParse(values.username).success}
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
          index={2}
          isPassword
          shakeKey={shake}
          error={errors.password?.message}
          valid={values.password.length > 0 && signupSchema.shape.password.safeParse(values.password).success}
          extra={<StrengthMeter value={values.password} />}
          inputProps={{
            ...register("password"),
            autoComplete: "new-password",
            required: true,
            readOnly: isSubmitting,
          }}
        />
        <div className="sx-field" style={{ "--i": 3 } as React.CSSProperties}>
          <SubmitButton
            status={isSubmitting ? "loading" : signedUp ? "success" : "idle"}
            idle="Create account"
            loading="Creating account..."
            success="Account created"
          />
        </div>
        {errors.root && (
          <p key={shake} role="alert" className="sx-root-error">
            {errors.root.message}
          </p>
        )}
        {signedUp && (
          <p role="status" className="sx-root-ok">
            Account created. You are now signed in.
          </p>
        )}
      </form>
      <p className="sx-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </>
  );
}
