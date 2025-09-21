import { CronJob } from "cron"
import { db } from "../database/config.ts"
import { surql } from "@surrealdb/surrealdb"
import { Mutex } from "async-mutex"
import pino from "pino"
import { Attendee } from "../routes/attendee/attendee.config.ts"

const mutex = new Mutex()
const logger = pino()
let last_run: Date | null = null
let last_duration: number = 0
let last_success: boolean = false

export const clean_attendee = CronJob.from({
  cronTime: '0 * * * * *',
  onTick: async function () {
    if(mutex.isLocked()){ 
      logger.warn('Attendee cleanup in progress, skipping this cycle')
      return
    }

    await mutex.runExclusive(async () => {
      await perform()
    })
  }
})

export const status_attendee = () => ({
  is_running: mutex.isLocked(),
  last_duration,
  last_run,
  last_success
})

async function perform(){
  const start_time = performance.now()
  try {
    const [expired_attendees] = await db.query<[Attendee[]]>(surql`SELECT * FROM attendee WHERE expires_at < time::now()-5m;`)

    if (expired_attendees.length === 0) {
      logger.info('Attendee cleanup found no expired attendee')
      last_run = new Date()
      last_duration = Math.round(performance.now() - start_time)
      last_success = true
      return
    }

    const BATCH_SIZE = 50;
    let deleted_count = 0;
    
    for (let i = 0; i < expired_attendees.length; i += BATCH_SIZE) {
      const batch = expired_attendees.slice(i, i + BATCH_SIZE);
      
      for await (const attendee of batch) {
        try {
          await db.delete(attendee.id)
          deleted_count++;
        } catch (_error) {
          logger.warn(`Failed to delete attendee ${attendee.id}`);
        }
      }
      
      if (i + BATCH_SIZE < expired_attendees.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    last_run = new Date()
    last_duration = Math.round(performance.now() - start_time)
    last_success = true
    logger.info(`Attendee cleanup complete: count = ${deleted_count} & duration = ${last_duration}`)
  } catch(err) {
    logger.error(`Attendee cleanup failed: ${err}`)
    last_run = new Date()
    last_duration = Math.round(performance.now() - start_time)
    last_success = false
    throw err
  }
}