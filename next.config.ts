import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // small self-contained server for the Docker image
  reactStrictMode: false,
  transpilePackages: ["three"],
};

export default nextConfig;
