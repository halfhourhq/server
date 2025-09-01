import { CronJob } from "cron"
import { db } from "../database/config.ts";
import { surql } from "@surrealdb/surrealdb";
import { HTTPException } from "@hono/hono/http-exception";

export const clean_attendee = CronJob.from({
  cronTime: '0 * * * * *',
  onTick: async function () {
    try {
      console.log('Attendees due:', await db.query(surql`RETURN count(SELECT * FROM attendee WHERE expires_at < time::now()-5m);`))

      await db.query(surql`DELETE attendee WHERE expires_at < time::now()-5m;`).catch(err => {
        console.log(err)
      })
    } catch(err) {
      console.log(err)
    }
  }
})