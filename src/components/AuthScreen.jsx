import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsSubmitting(true);

    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
      } else if (!data.session) {
        setStatus("Check your email to confirm your account, then sign in.");
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
      }
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-md">
        <img
          src={`${process.env.PUBLIC_URL}/digifusebox-logo.png`}
          alt="DigiFuseBox logo"
          className="mx-auto mb-3 h-auto w-full max-w-[180px]"
        />
        <h1 className="text-xl font-semibold text-zinc-800">
          {isSignUp ? "Create Account" : "Sign In"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Floorplan Fuse Manager</p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-zinc-600">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          <label className="block text-xs font-medium text-zinc-600">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          {status ? <p className="rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{status}</p> : null}
          {error ? <p className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full rounded-lg bg-zinc-800 text-sm font-semibold text-white transition hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60"
          >
            {isSubmitting ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setIsSignUp((prev) => !prev);
            setError("");
            setStatus("");
          }}
          className="mt-3 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 underline transition hover:text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
        >
          {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
      </div>
    </div>
  );
}
