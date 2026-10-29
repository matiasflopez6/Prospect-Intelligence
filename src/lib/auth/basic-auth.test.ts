import { describe, expect, it } from "vitest";
import { decideAccess } from "./basic-auth";

const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;

describe("decideAccess", () => {
  it("permite todo en local sin APP_PASSWORD", async () => {
    expect(await decideAccess("/", null, {})).toBe("allow");
  });

  it("bloquea con 503 en Railway sin APP_PASSWORD, salvo el healthcheck", async () => {
    const env = { RAILWAY_ENVIRONMENT: "production" };
    expect(await decideAccess("/", null, env)).toBe("misconfigured");
    expect(await decideAccess("/api/health", null, env)).toBe("allow");
  });

  it("exige credenciales cuando hay APP_PASSWORD", async () => {
    const env = { APP_PASSWORD: "s3cret" };
    expect(await decideAccess("/companies", null, env)).toBe("challenge");
    expect(await decideAccess("/companies", basic("admin", "mala"), env)).toBe("challenge");
    expect(await decideAccess("/companies", basic("otro", "s3cret"), env)).toBe("challenge");
    expect(await decideAccess("/companies", basic("admin", "s3cret"), env)).toBe("allow");
    expect(await decideAccess("/companies", "Basic ???", env)).toBe("challenge");
  });

  it("respeta APP_USERNAME y contraseñas con dos puntos", async () => {
    const env = { APP_USERNAME: "matias", APP_PASSWORD: "a:b:c" };
    expect(await decideAccess("/", basic("matias", "a:b:c"), env)).toBe("allow");
    expect(await decideAccess("/", basic("admin", "a:b:c"), env)).toBe("challenge");
  });

  it("el healthcheck no requiere credenciales", async () => {
    expect(await decideAccess("/api/health", null, { APP_PASSWORD: "x" })).toBe("allow");
  });
});
