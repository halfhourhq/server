import { CronJob } from "cron"
import { db } from "../database/config.ts"
import { surql } from "@surrealdb/surrealdb"
import { Mutex } from "async-mutex"
import pino from "pino"
import { Organiser } from "../routes/organiser/organiser.config.ts"

const mutex = new Mutex()
const logger = pino()
let last_run: Date | null = null
let last_duration: number = 0
let last_success: boolean = false

export const clean_organiser = CronJob.from({
  cronTime: '0 * * * * *',
  onTick: async function () {
    if(mutex.isLocked()){ 
      logger.warn('Organiser cleanup in progress, skipping this cycle')
      return 
    }

    await mutex.runExclusive(async () => {
      await perform()
    })
  }
})

export const status_organiser = () => ({
  is_running: mutex.isLocked(),
  last_duration,
  last_run,
  last_success
})

async function perform(){
  const start_time = performance.now()
  try {
    const [expired_organisers] = await db.query<[Organiser[]]>(surql`SELECT * FROM organiser WHERE end_time < time::now()-5m;`)

    if (expired_organisers.length === 0) {
      logger.info('Organiser cleanup found no expired organisers')
      last_run = new Date()
      last_duration = Math.round(performance.now() - start_time)
      last_success = true
      return
    }

    const BATCH_SIZE = 50;
    let deleted_count = 0;
    
    for (let i = 0; i < expired_organisers.length; i += BATCH_SIZE) {
      const batch = expired_organisers.slice(i, i + BATCH_SIZE);
      
      for await (const organiser of batch) {
        try {
          await db.delete(organiser.id)
          deleted_count++;
        } catch (_error) {
          logger.warn(`Failed to delete organiser ${organiser.id}`);
        }
      }
      
      if (i + BATCH_SIZE < expired_organisers.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    last_run = new Date()
    last_duration = Math.round(performance.now() - start_time)
    last_success = true
    logger.info(`Organiser cleanup complete: count = ${deleted_count} & duration = ${last_duration}`)
  } catch(err) {
    logger.error(`Organiser cleanup failed: ${err}`)
    last_run = new Date()
    last_duration = Math.round(performance.now() - start_time)
    last_success = false
    throw err
  }
}