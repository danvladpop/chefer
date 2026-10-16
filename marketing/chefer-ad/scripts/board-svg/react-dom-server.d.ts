// The ad project ships no @types/react-dom; this one-off exporter only needs this.
declare module "react-dom/server" {
  import type { ReactElement } from "react";
  export function renderToStaticMarkup(element: ReactElement): string;
}
