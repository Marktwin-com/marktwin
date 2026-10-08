declare module "*.jsx" {
  const Component: import("react").ComponentType<any>;
  export default Component;
}

declare module "@/assets/Logo.jsx" {
  const Component: import("react").ComponentType<any>;
  export default Component;
}

declare module "*.png" {
  const source: string;
  export default source;
}
