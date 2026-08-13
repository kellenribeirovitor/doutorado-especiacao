import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: process.env.GITHUB_ACTIONS ? "/doutorado-especiacao/" : "",
  trailingSlash: true,
};

export default nextConfig;
