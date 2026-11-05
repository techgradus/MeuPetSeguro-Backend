import { PetRoutine, rand, round1, RoutineSnapshot, Scenario } from "./routine";

export type SimDeviceType = "COLLAR" | "FOOD_BOWL" | "WATER_BOWL";

export type SimDevice = {
  deviceCode: string;
  type: SimDeviceType;
  petId: string;
  petName: string;
};

export type Publish = (topic: string, payload: object) => void;

type Entry = { device: SimDevice; startedAt: number; startBattery: number };

const BATTERY_MINUTES_PER_PERCENT = 30;

export class DeviceFleet {
  private devices = new Map<string, Entry>();
  private routines = new Map<string, PetRoutine>();

  constructor(
    private publish: Publish,
    private scenario: Scenario = "normal",
    private now: () => number = Date.now
  ) {}

  get size() {
    return this.devices.size;
  }

  /**
   * Alinha a frota com os dispositivos vinculados a pets no banco: liga (ONLINE) os que
   * apareceram e desliga (OFFLINE) os que foram desvinculados.
   */
  sync(devices: SimDevice[]) {
    const incoming = new Map(devices.map((d) => [d.deviceCode, d]));
    const added: string[] = [];
    const removed: string[] = [];

    for (const [code, entry] of this.devices) {
      const next = incoming.get(code);
      if (!next || next.petId !== entry.device.petId || next.type !== entry.device.type) {
        this.publishStatus(entry, "OFFLINE");
        this.devices.delete(code);
        removed.push(code);
      }
    }

    for (const device of incoming.values()) {
      if (this.devices.has(device.deviceCode)) continue;

      if (!this.routines.has(device.petId)) this.routines.set(device.petId, new PetRoutine(this.scenario));

      const entry: Entry = { device, startedAt: this.now(), startBattery: Math.round(rand(70, 100)) };
      this.devices.set(device.deviceCode, entry);
      this.publishStatus(entry, "ONLINE");
      added.push(device.deviceCode);
    }

    // Descarta a rotina de pets que ficaram sem dispositivos
    const activePets = new Set([...this.devices.values()].map((e) => e.device.petId));
    for (const petId of [...this.routines.keys()]) {
      if (!activePets.has(petId)) this.routines.delete(petId);
    }

    return { added, removed };
  }

  /** Publica uma leitura de cada dispositivo (a rotina de cada pet avança uma vez por chamada). */
  tick() {
    const snapshots = new Map<string, RoutineSnapshot>();

    for (const entry of this.devices.values()) {
      const { petId } = entry.device;
      let snapshot = snapshots.get(petId);
      if (!snapshot) {
        snapshot = this.routines.get(petId)!.advance(this.now());
        snapshots.set(petId, snapshot);
      }
      this.publishTelemetry(entry, snapshot);
    }

    return snapshots;
  }

  /** Marca todos como OFFLINE (ao encerrar o simulador). */
  shutdown() {
    for (const entry of this.devices.values()) this.publishStatus(entry, "OFFLINE");
    this.devices.clear();
    this.routines.clear();
  }

  private battery(entry: Entry) {
    const elapsedMin = (this.now() - entry.startedAt) / 60_000;
    return Math.max(10, entry.startBattery - Math.floor(elapsedMin / BATTERY_MINUTES_PER_PERCENT));
  }

  private publishStatus(entry: Entry, status: "ONLINE" | "OFFLINE") {
    this.publish(`meupet/${entry.device.deviceCode}/status`, {
      status,
      batteryLevel: this.battery(entry),
    });
  }

  private publishTelemetry(entry: Entry, snapshot: RoutineSnapshot) {
    const base = { recordedAt: new Date(this.now()).toISOString(), batteryLevel: this.battery(entry) };
    const topic = `meupet/${entry.device.deviceCode}/telemetry`;

    switch (entry.device.type) {
      case "COLLAR":
        this.publish(topic, { activityLevel: snapshot.activityLevel, intensity: snapshot.intensity, ...base });
        break;
      case "FOOD_BOWL":
        this.publish(topic, { weightGrams: round1(Math.max(0, snapshot.foodGrams + rand(-0.5, 0.5))), ...base });
        break;
      case "WATER_BOWL":
        this.publish(topic, { weightGrams: round1(Math.max(0, snapshot.waterGrams + rand(-2, 2))), ...base });
        break;
    }
  }
}