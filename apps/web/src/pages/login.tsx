import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSpacetimeDB } from "spacetimedb/react";
import { LoaderCircle } from "lucide-react";
import { AuthField, AuthFooterLink, AuthLayout, FormMessage, authInputClass } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, loginErrorMessage } from "@/lib/auth";
import { loginSchema, type LoginValues } from "@/lib/validation/login";

export default function Login() {
  const navigate = useNavigate();
  const { token, isActive } = useSpacetimeDB();
  const [signedIn, setSignedIn] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    clearErrors("root");
    setSignedIn(false);
    if (!isActive || !token) {
      setError("root", {
        message:
          "Unable to connect to the sign-in service. Please try again shortly.",
      });
      return;
    }
    try {
      await login(values, token);
      resetField("password");
      setSignedIn(true);
      navigate("/spaces", { replace: true });
    } catch (error) {
      setError("root", { message: loginErrorMessage(error) });
    }
  }

  return (
    <AuthLayout
      title="Log in to REALestate"
      description="Welcome back. Pick up your property research where you left off."
      footer={<>Don't have an account? <AuthFooterLink to="/signup">Sign up</AuthFooterLink></>}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        onChange={() => {
          clearErrors("root");
          setSignedIn(false);
        }}
        noValidate
        aria-busy={isSubmitting}
      >
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
            autoComplete="current-password"
            required
            readOnly={isSubmitting}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            className={authInputClass}
          />
        </AuthField>
        <Button type="submit" disabled={isSubmitting} className="h-10 w-full rounded-md text-sm">
          {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {isSubmitting ? "Signing in..." : "Continue"}
        </Button>
        {errors.root && <FormMessage tone="error">{errors.root.message}</FormMessage>}
        {signedIn && <FormMessage tone="status">Signed in successfully.</FormMessage>}
      </form>
    </AuthLayout>
  );
}
