import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  transpilePackages: ['@myalterlego/shared-ui'],
  serverExternalPackages: ['@google-cloud/secret-manager', '@myalterlego/secrets'],
};

export default nextConfig;
