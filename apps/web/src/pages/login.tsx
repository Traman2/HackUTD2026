import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSpacetimeDB } from "spacetimedb/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, loginErrorMessage } from "@/lib/auth";
import { loginSchema, type LoginValues } from "@/lib/validation/login";

export default function Login() {
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
    } catch (error) {
      setError("root", { message: loginErrorMessage(error) });
    }
  }

  return (
    <div className="login-grid-bg relative flex min-h-svh items-center justify-center px-6 pt-16 text-[#37352f]">
      <header className="absolute top-3 left-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-[#b9d8f3]"
          aria-label="REALestate home"
        >
          <img
            src="/logo.svg"
            alt=""
            width={32}
            height={32}
            className="block size-8 shrink-0 object-contain"
          />
          <span className="text-[13px] leading-none font-bold">REALestate</span>
        </Link>
      </header>

      <main className="w-full max-w-81.5 py-8">
        <h1 className="mb-4 text-center text-[22px] leading-7 font-bold tracking-[-0.5px]">
          Welcome back
        </h1>
        <form
          onSubmit={handleSubmit(onSubmit)}
          onChange={() => {
            clearErrors("root");
            setSignedIn(false);
          }}
          noValidate
          aria-busy={isSubmitting}
        >
          <div className="mb-3">
            <Label
              htmlFor="username"
              className="mb-1 block text-xs font-semibold"
            >
              Username
            </Label>
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
              className="h-8 rounded-[5px] border-[#e3e3e7] bg-white px-2 text-xs shadow-sm focus-visible:border-[#b9d8f3] focus-visible:ring-[3px] focus-visible:ring-[#b9d8f3]"
            />
            <p
              id="username-error"
              className="mt-1 min-h-3 text-[10px] leading-3 text-[#d92323]"
              aria-live="polite"
            >
              {errors.username?.message}
            </p>
          </div>
          <div className="mb-3">
            <Label
              htmlFor="password"
              className="mb-1 block text-xs font-semibold"
            >
              Password
            </Label>
            <Input
              id="password"
              {...register("password")}
              type="password"
              autoComplete="current-password"
              required
              readOnly={isSubmitting}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              className="h-8 rounded-[5px] border-[#e3e3e7] bg-white px-2 text-xs shadow-sm focus-visible:border-[#b9d8f3] focus-visible:ring-[3px] focus-visible:ring-[#b9d8f3]"
            />
            <p
              id="password-error"
              className="mt-1 min-h-3 text-[10px] leading-3 text-[#d92323]"
              aria-live="polite"
            >
              {errors.password?.message}
            </p>
          </div>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-10 w-full rounded-lg bg-black text-sm font-semibold text-white hover:bg-[#242424] focus-visible:ring-[#b9d8f3]"
          >
            {isSubmitting ? "Signing in..." : "Continue"}
          </Button>
          {errors.root && (
            <p
              role="alert"
              className="mt-2 text-[10px] leading-4 text-[#d92323]"
            >
              {errors.root.message}
            </p>
          )}
          {signedIn && (
            <p role="status" className="mt-2 text-[10px] leading-4">
              Signed in successfully.
            </p>
          )}
        </form>
        <p className="mt-3 text-center text-[10px]">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="font-semibold text-[#007bff] underline underline-offset-4 hover:text-[#005fcc]"
          >
            Sign up
          </Link>
        </p>
      </main>
    </div>
  );
}

