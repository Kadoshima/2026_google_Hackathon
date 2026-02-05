import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker環境でのホットリロード対応
  webpack: (config) => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
  // 全てのインターフェースでリッスン
  allowedDevOrigins: ["localhost", "0.0.0.0"],
};

export default nextConfig;
