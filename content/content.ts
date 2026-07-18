import { injectMobileBypass } from "./inject-mobile-bypass";
import { injectPageBridge } from "./inject-page-bridge";
import { mountDamageAnalyzerOverlay } from "./damage-overlay";
import { setupPageBridgeContentRelay } from "../lib/page-bridge/content-relay";

const bridgeSecret = crypto.randomUUID();

injectMobileBypass();
injectPageBridge(bridgeSecret);
setupPageBridgeContentRelay(bridgeSecret);
mountDamageAnalyzerOverlay();
