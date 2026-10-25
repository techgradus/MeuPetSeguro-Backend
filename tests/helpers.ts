import { generateToken } from "../src/utils/jwt";

export const TUTOR_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_TUTOR_ID = "22222222-2222-4222-8222-222222222222";
export const PET_ID = "33333333-3333-4333-8333-333333333333";

export const authHeader = (userId = TUTOR_ID) => `Bearer ${generateToken({ userId })}`;

export const pet = (overrides: Record<string, unknown> = {}) => ({
  id: PET_ID,
  name: "Rex",
  species: "Cachorro",
  tutorId: TUTOR_ID,
  ...overrides,
});

export const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
