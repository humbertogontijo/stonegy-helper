import { injectMobileBypass } from "./inject-mobile-bypass";
import { injectPageBridge } from "./inject-page-bridge";
import { setupPageBridgeContentRelay } from "../lib/page-bridge/content-relay";

const bridgeSecret = crypto.randomUUID();

injectMobileBypass();
injectPageBridge(bridgeSecret);
setupPageBridgeContentRelay(bridgeSecret);
