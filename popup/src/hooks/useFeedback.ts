import { useCallback, useEffect, useRef, useState } from "react";

export function useFeedback() {
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<"success" | "error">("success");
  const timerRef = useRef<number | null>(null);

  const showFeedback = useCallback((text: string, feedbackType: "success" | "error" = "success") => {
    setMessage(text);
    setType(feedbackType);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setMessage(null);
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { message, type, showFeedback };
}
