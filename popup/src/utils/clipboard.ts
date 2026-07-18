/**
 * Copy text to the clipboard. Prefer the Clipboard API; fall back to
 * execCommand when the page Permissions-Policy blocks navigator.clipboard
 * (common when the popup runs inside an injected iframe).
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to legacy path.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    const ok = document.execCommand("copy");
    if (!ok) {
      throw new Error("Failed to copy");
    }
  } finally {
    textarea.remove();
  }
}
