-- CreateEnum
CREATE TYPE "DeviceSource" AS ENUM ('REAL', 'SIMULATED');

-- AlterTable
-- Os dispositivos que já existem foram atendidos pelo simulador, então entram como SIMULATED.
-- Se algum deles for uma placa de verdade, troque depois: UPDATE devices SET source = 'REAL' WHERE "deviceCode" = '...';
ALTER TABLE "devices" ADD COLUMN "source" "DeviceSource" NOT NULL DEFAULT 'SIMULATED';

-- Daqui pra frente, quem não disser nada é dispositivo real.
ALTER TABLE "devices" ALTER COLUMN "source" SET DEFAULT 'REAL';
