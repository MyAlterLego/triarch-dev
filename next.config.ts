import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  transpilePackages: ['@myalterlego/shared-ui'],
  serverExternalPackages: ['@google-cloud/secret-manager', '@myalterlego/secrets'],
  async redirects() {
    return [
      // Static customer deliverable bundles in public/ — Next.js's default
      // trailingSlash:false means /folder/ → 308 → /folder, then /folder 404s
      // because Next.js doesn't auto-resolve index.html for directories in
      // public/. Redirect both forms to the explicit index.html URL.
      // (Tried rewrites first — they didn't fire for static-file destinations.)
      { source: '/ci-cd', destination: '/ci-cd/index.html', permanent: false },
      { source: '/ci-cd/', destination: '/ci-cd/index.html', permanent: false },
    ];
  },
};

export default nextConfig;
