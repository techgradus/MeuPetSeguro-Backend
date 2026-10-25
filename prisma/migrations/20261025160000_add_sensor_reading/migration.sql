-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('REPOUSO', 'LEVE', 'MODERADA', 'INTENSA');

-- CreateTable
CREATE TABLE "sensor_readings" (
    "id" TEXT NOT NULL,
    "activityLevel" "ActivityLevel",
    "intensity" DOUBLE PRECISION,
    "weightGrams" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sensor_readings_deviceId_recordedAt_idx" ON "sensor_readings"("deviceId", "recordedAt");

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
