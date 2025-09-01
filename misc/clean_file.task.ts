import { CronJob } from "cron"
import { db } from "../database/config.ts"
import { surql } from "@surrealdb/surrealdb"
import { File } from "../routes/storage/storage.config.ts"
import { HTTPException } from "@hono/hono/http-exception"
import { encodeBase64 } from "@std/encoding"

// const bucket = Deno.env.get('BB_BUCKET_ID')
const endpoint = Deno.env.get('BB_ENDPOINT_API')
const keys = () => {
  const id = Deno.env.get('BB_KEY_ID')
  const key = Deno.env.get('BB_KEY')
  if(!id || !key){ throw new Error('The object storage cannot be reached') } 

  return encodeBase64(`${id}:${key}`)
}

export const clean_file = CronJob.from({
  cronTime: '0 0 * * * *',
  onTick: async function () {
    try {
      const [files] = await db.query<[File[]]>(surql`DELETE file WHERE expires_at < time::now()-5m RETURN BEFORE;`).catch(err => {
        throw new HTTPException(400, { message: err as string })
      })

      const b2_auth_res = await fetch(endpoint+'/b2api/v4/b2_authorize_account', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${keys()}`
        }
      })
      const b2_auth = await b2_auth_res.json()
      if(!b2_auth_res.ok){throw new HTTPException(400, { message:  b2_auth.message })}
      
      await Promise.all(
        files.map(async file => {
          const b2_delete_res = await fetch(endpoint+'/b2api/v4/b2_delete_file_version', {
            method: 'POST',
            headers: {
              'Authorization': b2_auth.authorizationToken
            },
            body: JSON.stringify({
              fileName: file.original_filename,
              fileId: file.b2_file_id
            })
          })
          const b2_delete = await b2_delete_res.json()
          if(!b2_delete_res.ok){throw new HTTPException(404, { message:  b2_delete.message })}
        })
      )
    } catch(err) {
      console.log(err)
    }
  }
})