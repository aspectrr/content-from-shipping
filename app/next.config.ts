import type { NextConfig } from "next";

// Keep the pi SDK out of the bundler — it's server-only, heavy, and Node/Bun-native.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
};

export default nextConfig;
