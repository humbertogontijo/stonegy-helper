import { apiRequestAuth } from "./client";
import type { AuthRequest, AuthResponse } from "./types";

export async function login(request: AuthRequest): Promise<AuthResponse> {
  return apiRequestAuth("/api/auth", {
    method: "POST",
    body: {
      username: request.username,
      password: request.password,
      turnstileToken: request.turnstileToken ?? "",
    },
  });
}
