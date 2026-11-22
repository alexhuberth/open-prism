"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CloudIcon,
  CloudOffIcon,
  LogOutIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  translateSupabaseError,
  useCloudSyncStore,
} from "@/lib/supabase/cloud-sync";
import { useDocumentStore } from "@/stores/document-store";

interface CloudAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloudAuthDialog({ open, onOpenChange }: CloudAuthDialogProps) {
  const configured = useCloudSyncStore((s) => s.configured);
  const status = useCloudSyncStore((s) => s.status);
  const user = useCloudSyncStore((s) => s.user);
  const lastSyncedAt = useCloudSyncStore((s) => s.lastSyncedAt);
  const syncError = useCloudSyncStore((s) => s.error);
  const syncNow = useCloudSyncStore((s) => s.syncNow);
  const signOut = useCloudSyncStore((s) => s.signOut);
  const projectCount = useDocumentStore((s) => s.projects.length);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError("Ingresa tu correo electrónico y contraseña.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setInfoMessage(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) {
          setFormError(translateSupabaseError(error));
          return;
        }
        toast.success("Sesión iniciada. Sincronizando tus proyectos...");
        setPassword("");
        onOpenChange(false);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (error) {
          setFormError(translateSupabaseError(error));
          return;
        }
        if (data.session) {
          toast.success("Cuenta creada y conectada a la nube.");
          setPassword("");
          onOpenChange(false);
        } else {
          setInfoMessage(
            "Cuenta creada. Revisa tu bandeja de entrada para confirmar tu correo electrónico y luego inicia sesión aquí.",
          );
          setMode("login");
          setPassword("");
        }
      }
    } catch (err) {
      setFormError(translateSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncNow = async () => {
    await syncNow();
    if (!useCloudSyncStore.getState().error) {
      toast.success("Proyectos sincronizados con Supabase.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Sesión cerrada. Sigues trabajando en modo local.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudIcon className="size-4 text-primary" />
            Sincronización en la nube (Supabase)
          </DialogTitle>
          <DialogDescription>
            Guarda tus proyectos LaTeX en la nube para acceder desde cualquier
            computadora manteniendo respaldo local automático.
          </DialogDescription>
        </DialogHeader>

        {!configured ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <CloudOffIcon className="size-4" />
              Supabase no está configurado en este entorno
            </div>
            <p>
              Define <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
              <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> en{" "}
              <code>apps/web/.env.local</code> y reinicia el servidor.
            </p>
          </div>
        ) : user ? (
          <div className="space-y-4 py-1">
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">Cuenta</span>
                <span className="truncate font-medium text-xs">
                  {user.email ?? user.id}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">Estado</span>
                {status === "syncing" ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-600 text-xs dark:text-amber-400">
                    <RefreshCwIcon className="size-3 animate-spin" />
                    Sincronizando...
                  </span>
                ) : status === "error" ? (
                  <span className="inline-flex items-center gap-1.5 text-destructive text-xs">
                    <AlertCircleIcon className="size-3" />
                    Error de sincronización
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 text-xs dark:text-emerald-400">
                    <CheckCircle2Icon className="size-3" />
                    Sincronizado
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  Proyectos activos
                </span>
                <span className="text-xs">{projectCount}</span>
              </div>
              {lastSyncedAt && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">
                    Última sincronización
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(lastSyncedAt).toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>

            {syncError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
                {syncError}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSyncNow}
                disabled={status === "syncing"}
                className="gap-1.5"
              >
                <RefreshCwIcon
                  className={
                    status === "syncing" ? "size-3.5 animate-spin" : "size-3.5"
                  }
                />
                Sincronizar ahora
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <LogOutIcon className="size-3.5" />
                Cerrar sesión
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setFormError(null);
                }}
                className={`rounded px-2 py-1 font-medium text-xs transition-colors ${
                  mode === "login"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setFormError(null);
                }}
                className={`rounded px-2 py-1 font-medium text-xs transition-colors ${
                  mode === "signup"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Crear cuenta
              </button>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cloud-auth-email"
                className="block font-medium text-xs"
              >
                Correo electrónico
              </label>
              <Input
                id="cloud-auth-email"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cloud-auth-password"
                className="block font-medium text-xs"
              >
                Contraseña
              </label>
              <Input
                id="cloud-auth-password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
                {formError}
              </div>
            )}

            {infoMessage && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-700 text-xs dark:text-emerald-300">
                {infoMessage}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Tus proyectos locales actuales se conservarán y se sincronizarán
              automáticamente con tu cuenta al conectarte.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Seguir sin cuenta
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting
                  ? "Procesando..."
                  : mode === "login"
                    ? "Iniciar sesión"
                    : "Crear cuenta"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
