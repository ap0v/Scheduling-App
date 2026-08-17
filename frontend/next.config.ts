import type { NextConfig } from "next";

const backendOrigin = (process.env.BACKEND_ORIGIN ?? "http://localhost:8080").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: backendOrigin + "/api/:path*",
      },
    ];
  },
};

export default nextConfig;
