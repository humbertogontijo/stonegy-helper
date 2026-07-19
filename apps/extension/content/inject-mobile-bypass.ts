import mobileBypassScript from "./mobile-bypass.iife.ts?iife";
import { MOBILE_BYPASS_INJECTED_ATTR } from "@stonegy/helper/page-bridge/constants";
import { injectMainWorldScriptFromContent } from "@stonegy/helper/page-bridge/content-inject";

export function injectMobileBypass() {
  injectMainWorldScriptFromContent(
    mobileBypassScript,
    MOBILE_BYPASS_INJECTED_ATTR,
  );
}
