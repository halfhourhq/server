import { CronJob } from "cron"
import { db } from "../database/config.ts"
import { surql } from "@surrealdb/surrealdb"
import { File } from "../routes/storage/storage.config.ts"
import { Mutex } from "async-mutex"
import pino from "pino"
import { encodeBase64 } from "@std/encoding"

// const bucket = Deno.env.get('BB_BUCKET_ID')
const endpoint = Deno.env.get('BB_ENDPOINT_API')
const keys = () => {
  const id = Deno.env.get('BB_KEY_ID')
  const key = Deno.env.get('BB_KEY')
  if(!id || !key){ throw new Error('The object storage cannot be reached') } 

  return encodeBase64(`${id}:${key}`)
}

const mutex = new Mutex()
const logger = pino()
let last_run: Date | null = null
let last_duration: number = 0
let last_success: boolean = false

export const clean_file = CronJob.from({
  cronTime: '0 * * * * *',
  onTick: async function () {
    if(mutex.isLocked()){ 
      logger.warn('File cleanup in progress, skipping this cycle')
      return 
    }

    await mutex.runExclusive(async () => {
      await perform()
    })
  }
})

export const status_file = () => ({
  is_running: mutex.isLocked(),
  last_duration,
  last_run,
  last_success
})

async function perform(){
  const start_time = performance.now()
  try {
    const [expired_files] = await db.query<[File[]]>(surql`SELECT * FROM file WHERE expires_at < time::now()-5m;`)

    if (expired_files.length === 0) {
      logger.info('File cleanup found no expired files')
      last_run = new Date()
      last_duration = Math.round(performance.now() - start_time)
      last_success = true
      return
    }

    const b2_auth_res = await fetch(endpoint+'/b2api/v4/b2_authorize_account', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${keys()}`
      }
    })
    const b2_auth = await b2_auth_res.json()
    if(!b2_auth_res.ok){
      logger.error(`File cleanup storage error: ${b2_auth.message}`)
      last_run = new Date()
      last_duration = Math.round(performance.now() - start_time)
      last_success = true
      return
    }

    const BATCH_SIZE = 50;
    let deleted_count = 0;
    
    for (let i = 0; i < expired_files.length; i += BATCH_SIZE) {
      const batch = expired_files.slice(i, i + BATCH_SIZE);
      
      for await (const file of batch) {
        try {
          await fetch(endpoint+'/b2api/v4/b2_delete_file_version', {
            method: 'POST',
            headers: {
              'Authorization': b2_auth.authorizationToken
            },
            body: JSON.stringify({
              fileName: file.original_filename,
              fileId: file.b2_file_id
            })
          })
          await db.delete(file.id)
          deleted_count++;
        } catch (error) {
          logger.warn(`Failed to delete file ${file.id}, error: ${error}`);
        }
      }
      
      if (i + BATCH_SIZE < expired_files.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    last_run = new Date()
    last_duration = Math.round(performance.now() - start_time)
    last_success = true
    logger.info(`File cleanup complete: count = ${deleted_count} & duration = ${last_duration}`)
  } catch(err) {
    logger.error(`File cleanup failed: ${err}`)
    last_run = new Date()
    last_duration = Math.round(performance.now() - start_time)
    last_success = false
    throw err
  }
}