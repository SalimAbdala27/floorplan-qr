import { useEffect, useState } from "react";
import { formatSubscriptionDate, getSubscriptionEndLabel, hasActiveSubscription } from "../services/subscriptionAccess";

function formatLabel(value) {
  if (!value) return null;
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function SubscriptionGate({
  userEmail,
  subscription,
  onRefresh,
  onSignOut,
  onClose,
  onSubscribe,
  onManageBilling,
  onCancelSubscription,
  busyAction,
  errorMessage,
}) {
  const periodEndLabel = formatSubscriptionDate(subscription?.currentPeriodEnd);
  const subscriptionEndLabel = getSubscriptionEndLabel(subscription);
  const isActive = hasActiveSubscription(subscription);
  const statusLabel = formatLabel(subscription?.status) || "Inactive";
  const planLabel = formatLabel(subscription?.planName) || "Free";
  const billingLabel = formatLabel(subscription?.billingInterval);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-2xl">
        <div className="bg-[linear-gradient(135deg,_#101828_0%,_#1d2939_46%,_#9f1239_100%)] px-6 py-6 text-white">
          <div className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white">
            PDF Export
          </div>

          <h1 className="mt-4 text-2xl font-semibold">
            {isActive ? "Your export access is active" : "Unlock polished PDF exports"}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">
            Signed in as <span className="font-medium text-white">{userEmail || "Unknown user"}</span>.
            {!isActive
              ? " Keep building reports, brochures, and inspections as normal. Upgrade when you are ready to export client-facing PDFs."
              : " Your plan is active, so if export still looks locked just refresh your access below."}
          </p>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Plan</p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">{planLabel}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {billingLabel ? `${billingLabel} subscription` : "No paid plan assigned"}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Status</p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">{statusLabel}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {isActive ? "PDF export is available on this account." : "PDF export is currently locked."}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {subscription?.cancelAtPeriodEnd ? "Ends" : "Renewal"}
              </p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">{periodEndLabel || "Not set"}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {subscription?.cancelAtPeriodEnd
                  ? `Cancellation scheduled. Access stays active until ${subscriptionEndLabel || "the current period ends"}.`
                  : "Current access period information."}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-zinc-900">
              {isActive ? "Current plan benefits" : "What unlocks with a subscription"}
            </p>
            <div className="mt-3 grid gap-2 text-sm text-zinc-700 md:grid-cols-2">
              <div className="rounded-xl bg-white px-3 py-2">Property report PDF export</div>
              <div className="rounded-xl bg-white px-3 py-2">Inventory PDF export</div>
              <div className="rounded-xl bg-white px-3 py-2">Marketing brochure PDF export</div>
              <div className="rounded-xl bg-white px-3 py-2">Branding-ready client documents</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {!isActive ? (
              <button
                type="button"
                onClick={onSubscribe}
                disabled={busyAction === "subscribe"}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === "subscribe" ? "Opening checkout..." : "Choose a plan"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onManageBilling}
              disabled={busyAction === "portal"}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "portal" ? "Opening billing..." : "Manage billing"}
            </button>

            {isActive ? (
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(true)}
                disabled={busyAction === "cancel" || (subscription?.cancelAtPeriodEnd && subscriptionEndLabel)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {subscription?.cancelAtPeriodEnd
                  ? subscriptionEndLabel
                    ? `Ends On ${subscriptionEndLabel}`
                    : "Sync End Date"
                  : busyAction === "cancel"
                    ? "Scheduling cancellation..."
                    : "Cancel subscription"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onRefresh}
              disabled={busyAction === "refresh"}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              {busyAction === "refresh" ? "Refreshing..." : "Refresh access"}
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              Sign out
            </button>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
              >
                Close
              </button>
            ) : null}
          </div>

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
              {errorMessage}
            </p>
          ) : null}
        </div>
        {cancelConfirmOpen ? (
          <div className="border-t border-zinc-200 bg-zinc-50 p-6">
            <p className="text-sm font-semibold text-zinc-900">
              {subscription?.cancelAtPeriodEnd ? "Sync subscription end date?" : "Cancel at period end?"}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {subscription?.cancelAtPeriodEnd
                ? "The app will check Stripe again and save the current period end date for this subscription."
                : (
                  <>
                    Your subscription will stay active until <span className="font-medium text-zinc-900">{periodEndLabel || "the end of the current billing period"}</span>.
                    You will not be billed again after that unless you subscribe again.
                  </>
                )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
              >
                Keep subscription
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onCancelSubscription?.();
                  setCancelConfirmOpen(false);
                }}
                disabled={busyAction === "cancel"}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === "cancel"
                  ? subscription?.cancelAtPeriodEnd ? "Syncing..." : "Scheduling..."
                  : subscription?.cancelAtPeriodEnd ? "Sync end date" : "Yes, cancel at period end"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
