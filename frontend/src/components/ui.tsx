import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AlertCircle, Check, LoaderCircle, X } from "lucide-react";
import type { ArenaStatus, Color } from "../types";
import { t } from "../i18n";

const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider
      value={(message, error = false) => setToast({ message, error })}
    >
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button aria-label={t("Dismiss notification")} onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function Button({
  variant = "primary",
  busy = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "dark";
  busy?: boolean;
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      {...props}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}

export function Modal({
  title,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={t("Close dialog")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

const STATUS: Record<ArenaStatus, string> = {
  ready: "Not started",
  running: "Running",
  paused: "Paused",
  stepping: "Settling",
  awaiting_approval: "Pending approval",
  completed: "Finished",
};
export function StatusBadge({ status }: { status: ArenaStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <i />
      {t(STATUS[status])}
    </span>
  );
}
export function Avatar({
  name,
  color,
  small = false,
}: {
  name: string;
  color: Color;
  small?: boolean;
}) {
  return (
    <span className={`avatar avatar-${color} ${small ? "avatar-small" : ""}`}>
      {name.slice(0, 1)}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">A</span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state">
      <LoaderCircle size={22} className="spin" />
      {t("Loading")}
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <p>{message}</p>
      <Button variant="secondary" onClick={retry}>
        {t("Retry")}
      </Button>
    </div>
  );
}
export function Metric({
  label,
  value,
  suffix,
  icon,
  className = "",
}: {
  label: string;
  value: ReactNode;
  suffix?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`metric ${className}`}>
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <div className="metric-value">{value}</div>
      {suffix && <div className="metric-suffix">{suffix}</div>}
    </div>
  );
}
