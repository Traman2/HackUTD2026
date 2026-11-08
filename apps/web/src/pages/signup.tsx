import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSpacetimeDB } from "spacetimedb/react";
import { LoaderCircle } from "lucide-react";
import { AuthField, AuthFooterLink, AuthLayout, FormMessage, authInputClass } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signup, signupErrorMessage } from "@/lib/auth";
import { signupSchema, type SignupValues } from "@/lib/validation/signup";

export default function Signup() {
  const navigate = useNavigate();
  const { token, isActive } = useSpacetimeDB();
  const [signedUp, setSignedUp] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: "", username: "", password: "" },
  });

  async function onSubmit(values: SignupValues) {
    clearErrors("root");
    setSignedUp(false);
    if (!isActive || !token) {
      setError("root", {
        message:
          "Unable to connect to the signup service. Please try again shortly.",
      });
      return;
    }
    try {
      await signup(values, token);
      resetField("password");
      setSignedUp(true);
      navigate("/spaces", { replace: true });
    } catch (error) {
      const message = signupErrorMessage(error);
      setError(message === "Username is already taken." ? "username" : "root", { message }, { shouldFocus: message === "Username is already taken." });
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Turn property documents into an evidence-backed workspace."
      footer={<>Already have an account? <AuthFooterLink to="/login">Log in</AuthFooterLink></>}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        onChange={() => {
          clearErrors("root");
          setSignedUp(false);
        }}
        noValidate
        aria-busy={isSubmitting}
      >
        <AuthField id="displayName" label="Display name" error={errors.displayName?.message}>
          <Input
            id="displayName"
            {...register("displayName")}
            autoComplete="nickname"
            required
            readOnly={isSubmitting}
            aria-invalid={!!errors.displayName}
            aria-describedby={errors.displayName ? "displayName-error" : undefined}
            className={authInputClass}
          />
        </AuthField>
        <AuthField id="username" label="Username" error={errors.username?.message}>
          <Input
            id="username"
            {...register("username")}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            readOnly={isSubmitting}
            aria-invalid={!!errors.username}
            aria-describedby={errors.username ? "username-error" : undefined}
            className={authInputClass}
          />
        </AuthField>
        <AuthField id="password" label="Password" error={errors.password?.message}>
          <Input
            id="password"
            {...register("password")}
            type="password"
            autoComplete="new-password"
            required
            readOnly={isSubmitting}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            className={authInputClass}
          />
        </AuthField>
        <Button type="submit" disabled={isSubmitting} className="h-10 w-full rounded-md text-sm">
          {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
        {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
        {signedUp && <FormMessage tone="status">Account created. You are now signed in.</FormMessage>}
      </form>
    </AuthLayout>
  );
}
