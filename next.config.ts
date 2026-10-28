import type { NextConfig } from "next";

const config: NextConfig = {
  // Módulo nativo: no debe empaquetarse.
  serverExternalPackages: ["better-sqlite3", "playwright-core"],
  reactStrictMode: true,
};

export default config;
