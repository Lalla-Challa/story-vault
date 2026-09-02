import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Local vault lock screen.
 * - First launch (not configured): create a PIN that encrypts the local DB.
 * - Subsequent launches (configured, locked): enter the PIN to unlock.
 */
export default function LoginPage() {
  const { user, loading, vaultConfigured } = useAuth();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setupMutation = trpc.auth.setup.useMutation();
  const unlockMutation = trpc.auth.unlock.useMutation();

  useEffect(() => {
    if (!loading && user) setLocation("/projects");
  }, [loading, user, setLocation]);

  const isSubmitting = setupMutation.isPending || unlockMutation.isPending;

  const handleSetup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    if (pin.length < 4) {
      setErrorMessage("PIN must be at least 4 characters.");
      return;
    }
    if (pin !== confirmPin) {
      setErrorMessage("PINs do not match.");
      return;
    }
    try {
      await setupMutation.mutateAsync({ pin });
      await utils.auth.vaultState.invalidate();
      await utils.auth.me.invalidate();
      setLocation("/projects");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to configure vault.");
    }
  };

  const handleUnlock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!pin) {
      setErrorMessage("Enter your PIN.");
      return;
    }
    try {
      await unlockMutation.mutateAsync({ pin });
      setPin("");
      await utils.auth.vaultState.invalidate();
      await utils.auth.me.invalidate();
      setLocation("/projects");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to unlock vault.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center font-body-writing text-body-writing text-ink-charcoal p-4 md:p-8 relative selection:bg-stationery-amber selection:text-ink-charcoal" style={{ backgroundColor: "#faf9f8", backgroundImage: "linear-gradient(90deg, rgba(229, 226, 222, 0.3) 1px, transparent 1px), linear-gradient(rgba(229, 226, 222, 0.3) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
      {/* Ambient background element for focus */}
      <div className="fixed inset-0 pointer-events-none flex justify-center items-center z-0 overflow-hidden">
        <div className="w-[80vw] h-[80vw] md:w-[40vw] md:h-[40vw] rounded-full bg-surface-container-low opacity-50 blur-[100px]"></div>
      </div>

      {/* Main Auth Container */}
      <main className="w-full max-w-md z-10">
        {/* Brand Header */}
        <div className="text-center mb-10">
          <h1 className="font-display-hero text-display-hero text-ink-charcoal mb-2">Story Vault</h1>
          <p className="font-body-ui text-body-ui text-sage-slate">Your quiet place to write.</p>
        </div>

        {/* Auth Card */}
        <div className="bg-paper-base rounded-xl border border-muted-border p-8 md:p-10 relative overflow-hidden transition-all duration-300" style={{ boxShadow: "0 20px 40px rgba(45, 41, 38, 0.05)" }}>
          {!vaultConfigured ? (
            /* First-time PIN setup */
            <form className="space-y-6 animate-fade-in" onSubmit={handleSetup}>
              <div className="text-center mb-6">
                <h2 className="font-headline-md text-headline-md text-ink-charcoal mb-2">Create your vault PIN</h2>
                <p className="font-body-ui text-body-ui text-sage-slate text-sm">
                  This PIN encrypts your local database. Your writing lives only on this
                  device and cannot be recovered without it.
                </p>
              </div>
              <div className="space-y-1">
                <label className="font-body-ui text-body-ui text-sage-slate block" htmlFor="setup-pin">PIN</label>
                <input
                  className="w-full bg-surface-container-low border border-muted-border rounded px-4 py-3 font-body-writing text-body-writing text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber focus:border-stationery-amber transition-shadow pr-10"
                  id="setup-pin"
                  placeholder="••••••••"
                  required
                  autoFocus
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="font-body-ui text-body-ui text-sage-slate block" htmlFor="setup-confirm">Confirm PIN</label>
                <input
                  className="w-full bg-surface-container-low border border-muted-border rounded px-4 py-3 font-body-writing text-body-writing text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber focus:border-stationery-amber transition-shadow pr-10"
                  id="setup-confirm"
                  placeholder="••••••••"
                  required
                  type={showPin ? "text" : "password"}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 font-caption text-caption text-sage-slate cursor-pointer">
                <input type="checkbox" checked={showPin} onChange={(e) => setShowPin(e.target.checked)} />
                Show PIN
              </label>
              {errorMessage && (
                <div className="bg-error-container border border-error rounded px-4 py-3 font-body-ui text-body-ui text-on-error-container">
                  {errorMessage}
                </div>
              )}
              <button
                className="w-full bg-ink-charcoal text-paper-base font-body-ui text-body-ui py-3 rounded hover:bg-on-surface-variant transition-all duration-200 active:scale-97 mt-8 flex justify-center items-center gap-2"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating vault..." : "Create Vault"}
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </button>
            </form>
          ) : (
            /* PIN unlock */
            <form className="space-y-6 animate-fade-in" onSubmit={handleUnlock}>
              <div className="text-center mb-6">
                <h2 className="font-headline-md text-headline-md text-ink-charcoal mb-2">Welcome back</h2>
                <p className="font-body-ui text-body-ui text-sage-slate text-sm">
                  Enter your PIN to open your vault.
                </p>
              </div>
              <div className="space-y-1">
                <label className="font-body-ui text-body-ui text-sage-slate block" htmlFor="unlock-pin">PIN</label>
                <input
                  className="w-full bg-surface-container-low border border-muted-border rounded px-4 py-3 font-body-writing text-body-writing text-ink-charcoal focus:outline-none focus:ring-1 focus:ring-stationery-amber focus:border-stationery-amber transition-shadow pr-10"
                  id="unlock-pin"
                  placeholder="••••••••"
                  required
                  autoFocus
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 font-caption text-caption text-sage-slate cursor-pointer">
                <input type="checkbox" checked={showPin} onChange={(e) => setShowPin(e.target.checked)} />
                Show PIN
              </label>
              {errorMessage && (
                <div className="bg-error-container border border-error rounded px-4 py-3 font-body-ui text-body-ui text-on-error-container">
                  {errorMessage}
                </div>
              )}
              <button
                className="w-full bg-ink-charcoal text-paper-base font-body-ui text-body-ui py-3 rounded hover:bg-on-surface-variant transition-all duration-200 active:scale-97 mt-8 flex justify-center items-center gap-2"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Unlocking..." : "Unlock Vault"}
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </form>
          )}
        </div>

        {/* Footer snippet */}
        <div className="mt-12 text-center">
          <p className="font-caption text-caption text-sage-slate">
            © 2026 Story Vault. Crafted for professional writers.
          </p>
        </div>
      </main>
    </div>
  );
}