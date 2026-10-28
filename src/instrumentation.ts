export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobRunner } = await import("./modules/jobs/runner");
    startJobRunner();
  }
}
