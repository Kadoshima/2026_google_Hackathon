import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // 全てのインターフェースでリッスン
  allowedDevOrigins: ["localhost", "0.0.0.0"],
};

export default nextConfig;
