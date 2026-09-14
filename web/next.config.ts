import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next refuses to serve dev resources (the HMR socket, client bundles) to an origin it
   * was not told about. Opening the app on http://127.0.0.1:3000 instead of
   * http://localhost:3000 therefore loads the page but silently breaks hydration and
   * every client-side navigation — it looks like the app is down when it is not.
   *
   * Both spellings are the same machine, so both are allowed.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
