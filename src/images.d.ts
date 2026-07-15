// Image imports resolve to a base64 data: URI string at build time (see the
// `loader` map in esbuild.config.mjs) — usable directly as an <img src>,
// a CSS background-image, or anywhere else a URL string is expected.
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
