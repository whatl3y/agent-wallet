import bunyan from "bunyan";
import { config } from "./config.js";

export const logger = bunyan.createLogger({
  name: "web3-agent",
  level: config.logLevel,
});
