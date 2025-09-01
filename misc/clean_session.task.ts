import { CronJob } from "cron"
import { db } from "../database/config.ts";
import { surql } from "@surrealdb/surrealdb";
import { HTTPException } from "@hono/hono/http-exception";

export const clean_session = CronJob.from({
  cronTime: '0 * * * * *',
  onTick: async function () {
    try {
      console.log('Sessions due:', await db.query(surql`RETURN count(SELECT * FROM sessions WHERE expires_at < time::now()-5m);`))
      await db.query(surql`DELETE session WHERE expires_at < time::now()-5m;`).catch(err => {
        console.log(err)
      })
    } catch(err) {
      console.log(err)
    }
  }
})