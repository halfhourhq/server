import { CronJob } from "cron"
import { db } from "../database/config.ts"
import { surql } from "@surrealdb/surrealdb"
import { Mutex } from "async-mutex"
import pino from "pino"
import { Session } from "../routes/session/session.config.ts"

const mutex = new Mutex()
const logger = pino()
let last_run: Date | null = null
let last_duration: number = 0
let last_success: boolean = false

export const clean_session = CronJob.from({
  cronTime: '0 * * * * *',
  onTick: async function () {
    if(mutex.isLocked()){ 
      logger.warn('Session cleanup in progress, skipping this cycle')
      return 
    }

    await mutex.runExclusive(async () => {
      await perform()
    })
  }
})

export const status_session = () => ({
  is_running: mutex.isLocked(),
  last_duration,
  last_run,
  last_success
})

async function perform(){
  const start_time = performance.now()
  try {
    const [expired_sessions] = await db.query<[Session[]]>(surql`SELECT * FROM session WHERE expires_at < time::now()-5m;`)

    if (expired_sessions.length === 0) {
      logger.info('Session cleanup found no expired sessions')
      last_run = new Date()
      last_duration = Math.round(performance.now() - start_time)
      last_success = true
      return
    }

    const BATCH_SIZE = 50;
    let deleted_count = 0;
    
    for (let i = 0; i < expired_sessions.length; i += BATCH_SIZE) {
      const batch = expired_sessions.slice(i, i + BATCH_SIZE);
      
      for await (const session of batch) {
        try {
          await db.delete(session.id)
          deleted_count++;
        } catch (_error) {
          logger.warn(`Failed to delete session ${session.id}`);
        }
      }
      
      if (i + BATCH_SIZE < expired_sessions.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    last_run = new Date()
    last_duration = Math.round(performance.now() - start_time)
    last_success = true
    logger.info(`Session cleanup complete: count = ${deleted_count} & duration = ${last_duration}`)
  } catch(err) {
    logger.error(`Session cleanup failed: ${err}`)
    last_run = new Date()
    last_duration = Math.round(performance.now() - start_time)
    last_success = false
    throw err
  }
}