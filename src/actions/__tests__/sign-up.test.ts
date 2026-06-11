import { test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn(),
  },
}));
vi.mock("@/lib/auth", () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { signUp } from "@/actions";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

const mockPrismaUser = prisma.user as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};
const mockCreateSession = createSession as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

test("returns error when email is missing", async () => {
  const result = await signUp("", "password123");
  expect(result).toEqual({ success: false, error: "Email and password are required" });
});

test("returns error when password is missing", async () => {
  const result = await signUp("user@example.com", "");
  expect(result).toEqual({ success: false, error: "Email and password are required" });
});

test("returns error when both fields are missing", async () => {
  const result = await signUp("", "");
  expect(result).toEqual({ success: false, error: "Email and password are required" });
});

test("returns error when password is shorter than 8 characters", async () => {
  const result = await signUp("user@example.com", "short");
  expect(result).toEqual({ success: false, error: "Password must be at least 8 characters" });
});

test("returns error when password is exactly 7 characters", async () => {
  const result = await signUp("user@example.com", "1234567");
  expect(result).toEqual({ success: false, error: "Password must be at least 8 characters" });
});

test("returns error when email is already registered", async () => {
  mockPrismaUser.findUnique.mockResolvedValue({ id: "existing-id", email: "user@example.com" });

  const result = await signUp("user@example.com", "password123");

  expect(result).toEqual({ success: false, error: "Email already registered" });
  expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({ where: { email: "user@example.com" } });
});

test("creates user and session on successful signup", async () => {
  mockPrismaUser.findUnique.mockResolvedValue(null);
  mockPrismaUser.create.mockResolvedValue({ id: "new-user-id", email: "user@example.com" });

  const result = await signUp("user@example.com", "password123");

  expect(result).toEqual({ success: true });
  expect(mockPrismaUser.create).toHaveBeenCalledWith({
    data: { email: "user@example.com", password: "hashed-password" },
  });
  expect(mockCreateSession).toHaveBeenCalledWith("new-user-id", "user@example.com");
});

test("accepts password of exactly 8 characters", async () => {
  mockPrismaUser.findUnique.mockResolvedValue(null);
  mockPrismaUser.create.mockResolvedValue({ id: "new-user-id", email: "user@example.com" });

  const result = await signUp("user@example.com", "12345678");

  expect(result).toEqual({ success: true });
});

test("does not create user when email already exists", async () => {
  mockPrismaUser.findUnique.mockResolvedValue({ id: "existing-id", email: "user@example.com" });

  await signUp("user@example.com", "password123");

  expect(mockPrismaUser.create).not.toHaveBeenCalled();
  expect(mockCreateSession).not.toHaveBeenCalled();
});

test("returns generic error when database throws", async () => {
  mockPrismaUser.findUnique.mockRejectedValue(new Error("DB connection failed"));

  const result = await signUp("user@example.com", "password123");

  expect(result).toEqual({ success: false, error: "An error occurred during sign up" });
});

test("returns generic error when session creation fails", async () => {
  mockPrismaUser.findUnique.mockResolvedValue(null);
  mockPrismaUser.create.mockResolvedValue({ id: "new-user-id", email: "user@example.com" });
  mockCreateSession.mockRejectedValue(new Error("Session error"));

  const result = await signUp("user@example.com", "password123");

  expect(result).toEqual({ success: false, error: "An error occurred during sign up" });
});
