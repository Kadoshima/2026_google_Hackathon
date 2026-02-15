import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // 全てのインターフェースでリッスン
  allowedDevOrigins: ["localhost", "0.0.0.0"],
};

export default nextConfig;
