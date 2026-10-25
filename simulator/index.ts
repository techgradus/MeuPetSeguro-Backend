import "dotenv/config";
import { runCollarSimulator } from "./collar";
import { runBowlSimulator } from "./bowl";

const collarDeviceCode = process.env.SIM_COLLAR_DEVICE_CODE || "COLEIRA-01";
const foodBowlDeviceCode = process.env.SIM_FOOD_BOWL_DEVICE_CODE || "POTE-COMIDA-01";
const waterBowlDeviceCode = process.env.SIM_WATER_BOWL_DEVICE_CODE || "POTE-AGUA-01";

runCollarSimulator(collarDeviceCode);
runBowlSimulator("food", foodBowlDeviceCode);
runBowlSimulator("water", waterBowlDeviceCode);

console.log("Simulador MeuPet Seguro rodando (coleira + 2 potes). Ctrl+C para parar.\n");
