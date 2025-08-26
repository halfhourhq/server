import { HTTPException } from "@hono/hono/http-exception"
import { Hono } from "@hono/hono"
import { z }  from "zod"
import { decodeHex } from "@std/encoding"
import { timingSafeEqual } from "node:crypto"
import { UAParser } from "ua-parser-js"
import { verify_request } from "../../misc/verify_request.util.ts"
import { RecordId, surql } from "@surrealdb/surrealdb"
import { ConnectsWith } from "../meeting/meeting.config.ts"
import { db } from "../../database/config.ts"
import { Organiser } from "../organiser/organiser.config.ts"
import { generate_tag } from "../../misc/generate_tag.util.ts"
import { SignJWT } from "@panva/jose"
import { Session } from "../session/session.config.ts"

const organiser = new Hono<{ Variables: {user: {id: string, table: 'attendee' | 'organiser', session: string}} }>()

organiser.get('/', verify_request(['organiser']), async c => {
  const user = c.get('user')

  type PartialOrganiser = {
    id: RecordId<string>
    meeting_tag: string
    start_time: Date,
    end_time: Date,
    created_at: Date,
    connections: number,
    responses: number
  }

  type Connection = {
    attendee_id: RecordId<string>,
    connection_id: RecordId<string>
    response_tag: string,
    attendee_name: string
  }

  const [organiser] = (await db.query<[PartialOrganiser]>(surql`
    SELECT
    count(<-requests_to<-wave) as responses, 
    count(<-connects_with<-wave) as connections,
    id,
    start_time,
    end_time,
    meeting_tag,
    created_at
    FROM ONLY organiser WHERE id = ${new RecordId('organiser', user.id)} AND end_time >= time::now() LIMIT 1;
  `))

  if(!organiser){ throw new HTTPException(404, { message: 'The meeting is not found' }) }

  const connection = (await db.query<[Connection[]]>(surql`
    SELECT id as connection_id, out.id as attendee_id, out.response_tag as response_tag, out.name as attendee_name FROM connects_with WHERE in.id = ${new RecordId('organiser', user.id)};
  `))[0][0]

  return c.json({...organiser, connection})
})

organiser.post('/', async c => {
  const schema = z.object({
    start_time: z.preprocess((arg) => ( typeof arg === 'string' || arg instanceof Date ? new Date(arg) : undefined ), z.date()).refine(val => {
      return val > new Date()
    }, { message: 'You cannot schedule a bridge to a past date' }).refine(val => val <= new Date( Date.now() + 1000*60*60*24*90 ), {message: 'You cannot schedule a bridge more than 90 days in the future'}),
    public_key: z.string({message: 'Public key is required'}),
    keypair_salt: z.string({message: 'Key pair salt is required'}),
    password_hash: z.string({message: 'Password hash is required'}),
    password_salt: z.string({ message: 'Password salt is requred' }),
    name: z.string({ message: 'Name is required' })
  })
  
  const body = await c.req.json()

  const validation = schema.safeParse({
    start_time: body.start_time, 
    public_key: body.public_key, 
    keypair_salt: body.keypair_salt,
    password_hash: body.password_hash,
    password_salt: body.password_salt,
    name: body.name
  })

  if(validation.success === false){ 
    const formatted = validation.error.format()
    let message: string = ''
    formatted._errors.forEach(val => message = `${val}; `)
    if(formatted.start_time){ formatted.start_time?._errors.forEach(val => message = `${val}`) }
    if(formatted.public_key){ formatted.public_key?._errors.forEach(val => message = `${val}`) }
    if(formatted.keypair_salt){ formatted.keypair_salt?._errors.forEach(val => message = `${val}`) }
    if(formatted.password_hash){ formatted.password_hash?._errors.forEach(val => message = `${val}`) }
    if(formatted.password_salt){ formatted.password_salt?._errors.forEach(val => message = `${val}`) }
    if(formatted.name){ formatted.name?._errors.forEach(val => message = `${val}`) }
    throw new HTTPException(404, { message: message  }) 
  }

  const { start_time, public_key, keypair_salt, password_hash, password_salt, name } = validation.data

  const start = new Date(start_time).valueOf()
  const end = start + 1000*60*30
  const code = await generate_tag('organiser')
  const organiser_content: Partial<Organiser> = {
    meeting_tag: code,
    start_time: new Date(start),
    end_time: new Date(end),
    public_key: public_key,
    keypair_salt: keypair_salt,
    password_hash: password_hash,
    password_salt: password_salt,
    name: name
  }
  const [new_organiser] = await db.query<[Organiser]>(surql`CREATE ONLY organiser CONTENT ${organiser_content};`)
  return c.json({
    id: new_organiser.id,
    start_time: new_organiser.start_time,
    end_time: new_organiser.end_time,
    meeting_tag: new_organiser.meeting_tag,
    created_at: new_organiser.created_at
  })
})

organiser.post('/auth/start', async c => {
  const schema = z.object({
    meeting_tag: z.string({message: 'Meeting tag is required'})
  })

  const body = await c.req.json()
  const validation = schema.safeParse({meeting_tag: body.meeting_tag})

  if(validation.success === false){ 
    const formatted = validation.error.format()
    let message: string = ''
    formatted._errors.forEach(val => message = `${val}`)
    if(formatted.meeting_tag){ formatted.meeting_tag?._errors.forEach(val => message = `${val}`) }
    throw new HTTPException(404, { message: message  }) 
  }

  const { meeting_tag } = validation.data

  const [organiser] = await db.query<[Organiser]>(surql`SELECT * FROM ONLY organiser WHERE meeting_tag = ${meeting_tag} LIMIT 1;`)
  if(!organiser){  throw new HTTPException(400,  { message: 'Organiser was not found' }) }

  return c.json({
    password_salt: organiser.password_salt,
    meeting_tag: organiser.meeting_tag
  })
})

organiser.post('/auth/finish', async c => {
  const encoder = new TextEncoder()
  const schema = z.object({
    password_hash: z.string({message: 'Password hash is required'}),
    meeting_tag: z.string({message: 'Meeting tag is required'})
  })

  const body = await c.req.json()
  const validation = schema.safeParse({password_hash: body.password_hash, meeting_tag: body.meeting_tag})

  if(validation.success === false){ 
    const formatted = validation.error.format()
    let message: string = ''
    formatted._errors.forEach(val => message = `${val}`)
    if(formatted.meeting_tag){ formatted.meeting_tag?._errors.forEach(val => message = `${val}`) }
    if(formatted.password_hash){ formatted.password_hash?._errors.forEach(val => message = `${val}`) }
    throw new HTTPException(404, { message: message  }) 
  }

  const { meeting_tag, password_hash } = validation.data

  const [organiser] = await db.query<[Organiser]>(surql`SELECT * FROM ONLY organiser WHERE public_code = ${meeting_tag} LIMIT 1;`)
  if(!organiser){  throw new HTTPException(400,  { message: 'Organiser was not found' }) }

  const [session] = await db.query<[number]>(surql`RETURN count(SELECT * FROM session WHERE user = ${organiser.id});`)

  if(session > 0){ throw new HTTPException(400, { message: 'You have an active session elsewhere, logout first before proceeding' }) }

  const provided_secret = decodeHex(password_hash)
  const stored_secret = decodeHex(organiser.password_hash)
  const match = timingSafeEqual(stored_secret, provided_secret)

  if(match === false){ throw new HTTPException(400, { message: 'The meeting tag or the password is wrong' }) }

  const [connection] = await db.query<[ConnectsWith]>(surql`SELECT * FROM ONLY connects_with WHERE in = ${organiser.id} LIMIT 1;`)

  const organiser_id = organiser.id.id.toString()
  const jwt_secret = Deno.env.get('JWT_SECRET')
  const jwt_expiration = new Date(organiser.end_time)
  if(!jwt_expiration || !jwt_secret){ throw new HTTPException(400, { message: 'Access token could not be generated' }) }
  const encodedSecret =  encoder.encode(jwt_secret)

  const { os, browser, device } = UAParser(c.req.header('User-Agent'))
  const session_content: Partial<Session> = {
    user: organiser.id,
    browser: browser.name ? browser.name : 'Unknown',
    device: device.type && device.vendor ? `${device.vendor} - ${device.type}` : 'Unknown',
    os: os.name ? os.name : 'Unknown',
    expires_at: new Date( organiser.end_time )
  }

  const [new_session] = await db.query<[Session]>(surql`CREATE ONLY session CONTENT ${session_content};`)

  const token = await new SignJWT({ id: organiser_id, sid: new_session.id.id.toString(), role: 'attendee' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(jwt_expiration).sign(encodedSecret)

  if(connection){
    return c.json({
      approved: true,
      access_token: token,
      connection_id: connection.id.id.toString(),
      start_time: organiser.start_time,
      end_time: organiser.end_time
    })
  } else {
    return c.json({
      approved: false,
      access_token: token,
      connection_id: null,
      start_time: organiser.start_time,
      end_time: organiser.end_time
    })
  }
})

export default organiser