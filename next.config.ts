import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev HMR cross-origin 허용 (127.0.0.1 / localhost / *.local).
  // Next.js 16 의 보안 기본값이 cross-origin dev resource 를 차단하므로 명시 허용.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
