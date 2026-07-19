/// <reference types="vite/client" />
/// <reference types="@crxjs/vite-plugin/client" />

declare module "*.svg" {
  const src: string;
  export default src;
}
