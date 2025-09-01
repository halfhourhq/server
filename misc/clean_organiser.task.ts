import { CronJob } from "cron"
import { db } from "../database/config.ts";
import { surql } from "@surrealdb/surrealdb";
import { HTTPException } from "@hono/hono/http-exception";

export const clean_organiser = CronJob.from({
  cronTime: '0 * * * * *',
  onTick: async function () {
    try {
      console.log('Organisers due:', await db.query(surql`RETURN count(SELECT * FROM organiser WHERE end_time < time::now()-5m);`))
      await db.query(surql`DELETE organiser WHERE end_time < time::now()-5m;`).catch(err => {
        console.log(err)
      })
    } catch(err) {
      console.log(err)
    }
  }
})