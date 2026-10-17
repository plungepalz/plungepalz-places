import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-map-gl", "mapbox-gl"],
  // Keep the Python API out of Next.js file tracing and webpack watch.
  outputFileTracingExcludes: {
    "*": ["./backend/**/*", "./docs/**/*"],
  },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/backend/**",
        "**/.git/**",
        "**/.next/**",
      ],
    };
    return config;
  },
};

export default nextConfig;
