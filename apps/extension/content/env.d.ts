/// <reference types="@crxjs/vite-plugin/client" />

declare module "*.svg?raw" {
  const content: string;
  export default content;
}
