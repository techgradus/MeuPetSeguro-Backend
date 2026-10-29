import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app";
import { prismaMock } from "../prismaMock";
import { hashPassword } from "../../src/utils/password";
import { authHeader, OTHER_TUTOR_ID, pet, PET_ID, TUTOR_ID } from "../helpers";

const user = async () => ({
  id: TUTOR_ID,
  name: "Ana",
  email: "ana@meupet.com",
  password: await hashPassword("senha123"),
  phone: null,
  photoUrl: null,
});

describe("GET /api/health", () => {
  it("200 com banco conectado", async () => {
    prismaMock.$queryRaw.mockResolvedValue([1]);
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "connected" });
  });

  it("503 com banco fora do ar", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("down"));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
  });
});

describe("autenticação", () => {
  it("POST /auth/register cria usuário sem devolver a senha", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async ({ data }) => ({ id: TUTOR_ID, ...data }));

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana", email: "ana@meupet.com", password: "senha123" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: TUTOR_ID, email: "ana@meupet.com" });
    expect(res.body).not.toHaveProperty("password");
    // a senha é salva com hash, nunca em texto puro
    expect(prismaMock.user.create.mock.calls[0][0].data.password).not.toBe("senha123");
  });

  it("POST /auth/register com e-mail repetido devolve 409", async () => {
    prismaMock.user.findUnique.mockResolvedValue(await user());

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana", email: "ana@meupet.com", password: "senha123" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("E-mail já cadastrado");
  });

  it("POST /auth/register valida o corpo", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "Ana", email: "x", password: "1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("E-mail inválido");
  });

  it("POST /auth/login devolve token que abre rotas protegidas", async () => {
    prismaMock.user.findUnique.mockResolvedValue(await user());

    const login = await request(app).post("/api/auth/login").send({ email: "ana@meupet.com", password: "senha123" });

    expect(login.status).toBe(200);
    expect(login.body.user).not.toHaveProperty("password");

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("ana@meupet.com");
  });

  it("POST /auth/login com senha errada devolve 401", async () => {
    prismaMock.user.findUnique.mockResolvedValue(await user());

    const res = await request(app).post("/api/auth/login").send({ email: "ana@meupet.com", password: "errada" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("E-mail ou senha incorretos");
  });

  it.each([
    [undefined, "Token não fornecido"],
    ["Bearer", "Token mal formatado"],
    ["Bearer abc.def.ghi", "Token inválido ou expirado"],
  ])("rota protegida com Authorization=%s devolve 401", async (header, message) => {
    const req = request(app).get("/api/pets");
    const res = header ? await req.set("Authorization", header) : await req;
    expect(res.status).toBe(401);
    expect(res.body.error).toBe(message);
  });
});

describe("pets e dispositivos", () => {
  it("GET /api/pets lista só os pets do tutor logado", async () => {
    prismaMock.pet.findMany.mockResolvedValue([pet()]);

    const res = await request(app).get("/api/pets").set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prismaMock.pet.findMany.mock.calls[0][0].where).toEqual({ tutorId: TUTOR_ID });
  });

  it("tutor não acessa pet de outro tutor (403)", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet({ tutorId: OTHER_TUTOR_ID }));

    const res = await request(app).get(`/api/pets/${PET_ID}`).set("Authorization", authHeader());

    expect(res.status).toBe(403);
  });

  it("POST /pets/:petId/devices vincula dispositivo (201) e repetido dá 409", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "d1", petId: PET_ID });
    prismaMock.device.create.mockImplementation(async ({ data }) => ({ id: "d1", status: "OFFLINE", ...data }));

    const body = { type: "WATER_BOWL", deviceCode: "esp32-01" };
    const created = await request(app).post(`/api/pets/${PET_ID}/devices`).set("Authorization", authHeader()).send(body);
    const repeated = await request(app).post(`/api/pets/${PET_ID}/devices`).set("Authorization", authHeader()).send(body);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ deviceCode: "ESP32-01", status: "OFFLINE" });
    expect(repeated.status).toBe(409);
  });

  it("rota inexistente devolve 404", async () => {
    const res = await request(app).get("/api/nao-existe");
    expect(res.status).toBe(404);
  });
});

describe("vacinas", () => {
  it("rotas de vacina continuam exigindo login", async () => {
    const res = await request(app).get(`/api/pets/${PET_ID}/vaccines`);
    expect(res.status).toBe(401);
  });

  it("GET /pets/:petId/vaccines lista as vacinas do pet", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.vaccine.findMany.mockResolvedValue([{ id: "vac-1", name: "V10" }]);

    const res = await request(app).get(`/api/pets/${PET_ID}/vaccines`).set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "vac-1", name: "V10" }]);
  });
});
