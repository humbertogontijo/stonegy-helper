interface FeedbackToastProps {
  message: string | null;
  type: "success" | "error";
}

export function FeedbackToast({ message, type }: FeedbackToastProps) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="status"
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`mx-2 mb-2 mt-auto shrink-0 rounded-md px-2.5 py-1.5 text-xs ${
        type === "error"
          ? "bg-[rgba(214,91,74,0.15)] text-[var(--danger)]"
          : "bg-[rgba(161,222,83,0.12)] text-[var(--success)]"
      }`}
    >
      {message}
    </p>
  );
}
