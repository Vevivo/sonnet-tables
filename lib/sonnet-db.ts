import {env} from "cloudflare:workers";
import {REFEREE} from "./sonnet-types";
export function database():D1Database {const db=(env as Cloudflare.Env).DB;if(!db)throw new Error("The shared index is unavailable.");return db;}
export function refereePin():string{return REFEREE;}
