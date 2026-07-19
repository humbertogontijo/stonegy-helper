import pageBridgeScript from "./page-bridge.iife.ts?iife";
import { injectPageBridgeFromContent } from "@stonegy/helper/page-bridge/content-inject";

export function injectPageBridge(authSecret: string) {
  return injectPageBridgeFromContent(pageBridgeScript, authSecret);
}
