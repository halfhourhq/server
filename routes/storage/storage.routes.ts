import { HTTPException } from "@hono/hono/http-exception"
import { stream } from "@hono/hono/streaming"
import { Hono } from "@hono/hono"
import { verify_request } from "../../misc/verify_request.util.ts"
import { PreparedQuery, RecordId, surql } from "@surrealdb/surrealdb"
import { db } from "../../database/config.ts"
import { ConnectsWith } from "../meeting/meeting.config.ts"
import { Organiser } from "../organiser/organiser.config.ts"
import { z }  from "zod"
import { encodeBase64 } from "@std/encoding"
import { sanitise_name } from "../../misc/sanitise_name.util.ts"
import { File } from "./storage.config.ts"

const bucket = Deno.env.get('BB_BUCKET_ID')
const endpoint = Deno.env.get('BB_ENDPOINT_API')
const keys = () => {
  const id = Deno.env.get('BB_KEY_ID')
  const key = Deno.env.get('BB_KEY')
  if(!id || !key){ throw new Error('The object storage cannot be reached') } 

  return encodeBase64(`${id}:${key}`)
}

const storage = new Hono<{ Variables: {user: {id: string, table: 'attendee' | 'organiser', session: string}} }>()

storage.get('/connection/:id', verify_request(['attendee', 'organiser']), async c => {
  const user = c.get('user')
  const connection_id = c.req.param('id')
  const file_id = c.req.query('file')

  if(!file_id){ throw new HTTPException(400, { message: 'Provide the file id' }) }

  let query: PreparedQuery
  switch(user.table){
    case 'organiser':
      query = surql`SELECT * FROM ONLY connects_with WHERE id = ${new RecordId('connects_with', connection_id)} AND in = ${new RecordId('organiser', user.id)} LIMIT 1;`
      break;
    case 'attendee':
      query = surql`SELECT * FROM ONLY connects_with WHERE id = ${new RecordId('connects_with', connection_id)} AND out = ${new RecordId('attendee', user.id)} LIMIT 1;`
      break;
  } 

  const [connection] = await db.query<[ConnectsWith]>(query)
  if(!connection){ throw new HTTPException(403, { message: 'Meeting not found' }) }

  const [organiser] = await db.query<[Organiser]>(surql`SELECT * FROM ONLY organiser WHERE id = ${connection.in} LIMIT 1;`)

  if(organiser.start_time > new Date()){ throw new HTTPException(403, { message: 'The meeting is not active yet' }) }
  if(organiser.end_time < new Date()){ throw new HTTPException(403, { message: 'The meeting is not longer active' }) }

  const [file, opened] = await db.query<[File, number]>(surql`
    SELECT * FROM ONLY file WHERE id = ${new RecordId('file', file_id)} AND organiser = ${connection.in} LIMIT 1;
    RETURN count(SELECT * FROM opened_by WHERE in = ${new RecordId('file', file_id)} AND out = ${new RecordId(user.table, user.id)});
  `)
  if(!file){ throw new HTTPException(400, { message: 'File not found' }) }
  if(opened > 0){ throw new HTTPException(400, { message: 'You have already opened this file' }) }
  if(file.downloads_count >= file.downloads_total){ throw new HTTPException(400, { message: 'You have reached the maximum downloads on this file' }) }

  const b2_auth_res = await fetch(endpoint+'/b2api/v4/b2_authorize_account', {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${keys()}`
    }
  })
  const b2_auth = await b2_auth_res.json()
  if(!b2_auth_res.ok){throw new HTTPException(404, { message:  b2_auth.message })}

  const b2_download_res = await fetch(`${endpoint}/b2api/v4/b2_download_file_by_id?fileId=${file.b2_file_id}`, {
    method: 'GET',
    headers: {
      'Authorization': b2_auth.authorizationToken
    }
  })

  if(!b2_download_res.ok){
    const error = await b2_download_res.json()
    throw new HTTPException(404, { message:  error.message })
  }

  await db.query(surql`RELATE ${file.id}->opened_by->${new RecordId(user.table, user.id)};`)

  c.header('Content-Disposition', 'inline')
  c.header('Content-Type', b2_download_res.headers.get('Content-Type') || file.content_type)
  return stream(c, async stream => {
    stream.onAbort(() => {  })
    if(b2_download_res.body){
      await stream.pipe(b2_download_res.body)
    } else {
      stream.abort()
    }
  })
})

storage.post('/connection/:id', verify_request(['attendee', 'organiser']), async c => {
  const user = c.get('user')
  const id = c.req.param('id')
  const storage_limit = ( 20 * (1024 ** 2) )

  let query: PreparedQuery
  switch(user.table){
    case 'organiser':
      query = surql`SELECT * FROM ONLY connects_with WHERE id = ${new RecordId('connects_with', id)} AND in = ${new RecordId('organiser', user.id)} LIMIT 1;`
      break;
    case 'attendee':
      query = surql`SELECT * FROM ONLY connects_with WHERE id = ${new RecordId('connects_with', id)} AND out = ${new RecordId('attendee', user.id)} LIMIT 1;`
      break;
  } 

  const [connection] = await db.query<[ConnectsWith]>(query)
  if(!connection){ throw new HTTPException(403, { message: 'Meeting not found' }) }

  const [total_storage, organiser] = await db.query<[number, Organiser]>(
    surql`
      RETURN math::sum(SELECT VALUE size FROM file WHERE organiser = ${connection.in});
      SELECT * FROM ONLY organiser WHERE id = ${connection.in} LIMIT 1;
    `
  )

  if(organiser.start_time > new Date()){ throw new HTTPException(403, { message: 'The meeting is not active yet' }) }
  if(organiser.end_time < new Date()){ throw new HTTPException(403, { message: 'The meeting is not longer active' }) }

  if(total_storage >= storage_limit){ throw new HTTPException(400, { message: 'This meeting has reached its storage limit' }) }

  const schema = z.object({
    sha1: z.string({ message: 'Provide a SHA1 hash of the file' }),
    type: z.string({ message: 'Provide the content type of the file' }),
    name: z.string({ message: 'Provide the file name' }),
    size: z.number({ message: 'Provide the file size'}).min(1, 'The file size must be at least 1 byte').max(5*1024*2024, 'The file size cannot exceed 5 MB'),
    file: z.instanceof(Uint8Array, { message: 'Provide the file' }).refine(arr => arr.length <= 5*1024*2024+16, { message: 'File cannot be bigger than 5MB' })
  })

  const body = await c.req.formData()
  const validation = schema.safeParse({
    sha1: body.get('sha1'), 
    type: body.get('type'), 
    name: body.get('name'),
    size: body.get('size'),
    file: body.get('file')
  })

  if(validation.success === false){ 
    const formatted = validation.error.format()
    let  message = ''
    formatted._errors.forEach(val => message = val)
    if(formatted.sha1){ formatted.sha1?._errors.forEach(val => message = `${val}`) }
    if(formatted.type){ formatted.type?._errors.forEach(val => message = `${val}`) }
    if(formatted.name){ formatted.name?._errors.forEach(val => message = `${val}`) }
    if(formatted.size){ formatted.size?._errors.forEach(val => message = `${val}`) }
    throw new HTTPException(404, { message: message  }) 
  }

  const b2_auth_res = await fetch(endpoint+'/b2api/v4/b2_authorize_account', {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${keys()}`
    }
  })
  const b2_auth = await b2_auth_res.json()
  if(!b2_auth_res.ok){throw new HTTPException(400, { message:  b2_auth.message })}

  const b2_upload_res = await fetch(`${endpoint}/b2api/v4/b2_get_upload_url?bucketId=${bucket}`, {
    method: 'GET',
    headers: {
      'Authorization': b2_auth.authorizationToken
    }
  })
  const b2_upload = await b2_upload_res.json()
  if(!b2_upload_res.ok){throw new HTTPException(400, { message:  b2_upload.message })}

  const { name, sha1, type, size, file } = validation.data

  const sanitisation = await sanitise_name(name)
  const file_storage_path = `${organiser.meeting_tag.replace(/[^A-Z]/g, '')}/${sanitisation.storage_name}`

  const uploading_res = await fetch(b2_upload.uploadUrl, {
    method: 'POST',
    headers: { 
      'Authorization': b2_upload.authorizationToken,
      'X-Bz-File-Name': file_storage_path,
      'Content-Type': 'application/octet-stream',
      'Content-Length': size.toString(),
      'X-Bz-Content-Sha1': sha1
    },
    body: file
  })

  const uploading = await uploading_res.json()
  if(!uploading_res.ok){ throw new HTTPException(400, { message: uploading.message }) }

  const file_content: Partial<File> = {
    organiser: connection.in,
    b2_file_id: uploading.fileId,
    downloads_count: 0,
    downloads_total: 2,
    name: sanitisation.display_name,
    original_filename: file_storage_path,
    content_type: type,
    sha1: sha1,
    size: size,
    is_complete: true,
    expires_at: organiser.end_time
  }

  const [new_file] = await db.query<[File]>(surql`CREATE ONLY file CONTENT ${file_content};`)

  return c.json({ id: new_file.id.id.toString() })
})

export default storage