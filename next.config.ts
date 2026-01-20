import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
const hasBasePath = Boolean(basePath);

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: hasBasePath ? true : undefined,
};

export default nextConfig;
