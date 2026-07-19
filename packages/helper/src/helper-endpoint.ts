/** Local Stonegy Helper (Node) bind address — single source of truth for apps + UI. */
export const HELPER_HOST = "127.0.0.1";
export const HELPER_PORT = 17865;
export const HELPER_BASE_URL = `http://${HELPER_HOST}:${HELPER_PORT}`;
export const HELPER_EXTENSION_WS_URL = `ws://${HELPER_HOST}:${HELPER_PORT}/v1/extension`;
