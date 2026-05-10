import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  transpilePackages: ['@myalterlego/shared-ui'],
  serverExternalPackages: ['@google-cloud/secret-manager', '@myalterlego/secrets'],
  async rewrites() {
    return [
      // Static customer deliverable bundles in public/ — Next.js's default
      // trailingSlash:false means /folder/ → 308 → /folder which 404s. Rewrite
      // these directory URLs to the bundled index.html so both /folder and
      // /folder/ resolve to the landing page cleanly.
      { source: '/triarch-cicd-package', destination: '/triarch-cicd-package/index.html' },
      { source: '/triarch-cicd-package/', destination: '/triarch-cicd-package/index.html' },
    ];
  },
};

export default nextConfig;
