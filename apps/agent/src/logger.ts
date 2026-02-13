import bunyan from "bunyan";
import { config } from "./config.js";

export const logger = bunyan.createLogger({
  name: "agent-wallet",
  level: config.logLevel,
});
