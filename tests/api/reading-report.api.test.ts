import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app";
import { prismaMock } from "../prismaMock";
import { authHeader, OTHER_TUTOR_ID, pet, PET_ID } from "../helpers";

const base = `/api/pets/${PET_ID}/readings`;

describe("rotas de leituras do pet (/pets/:petId/readings)", () => {
  it.each(["latest", "activity?period=today", "consumption?kind=food"])("401 sem token em %s", async (path) => {
    const res = await request(app).get(`${base}/${path}`);
    expect(res.status).toBe(401);
  });

  it("GET /latest devolve o estado atual do pet", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findMany.mockResolvedValue([]);

    const res = await request(app).get(`${base}/latest`).set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ petId: PET_ID, collar: null, foodBowl: null, waterBowl: null });
  });

  it("404/403 para pet de outro tutor", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet({ tutorId: OTHER_TUTOR_ID }));

    const res = await request(app).get(`${base}/latest`).set("Authorization", authHeader());

    expect([403, 404]).toContain(res.status);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /activity usa 'today' por padrão e devolve os 12 blocos", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findMany.mockResolvedValue([]);

    const res = await request(app).get(`${base}/activity`).set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ period: "today", hasDevice: false, hasData: false });
    expect(res.body.buckets).toHaveLength(12);
  });

  it("GET /activity?period=week devolve 7 blocos", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findMany.mockResolvedValue([]);

    const res = await request(app).get(`${base}/activity?period=week`).set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.buckets).toHaveLength(7);
  });

  it("400 com período inválido", async () => {
    const res = await request(app).get(`${base}/activity?period=ano`).set("Authorization", authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Período inválido");
  });

  it("GET /consumption devolve a capacidade do pote", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`${base}/consumption?kind=water`)
      .set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kind: "water", capacity: 1000, hasDevice: false });
    expect(res.body.daily).toHaveLength(7);
  });

  it("400 sem informar o tipo (kind)", async () => {
    const res = await request(app).get(`${base}/consumption`).set("Authorization", authHeader());
    expect(res.status).toBe(400);
  });

  it("400 com tipo inválido", async () => {
    const res = await request(app).get(`${base}/consumption?kind=ar`).set("Authorization", authHeader());
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Tipo inválido");
  });
});