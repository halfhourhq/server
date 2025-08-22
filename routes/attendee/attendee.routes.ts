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
import { Attendee, RequestsTo } from "./attendee.config.ts"
import { SignJWT } from "@panva/jose"
import { Session } from "../session/session.config.ts"

const attendee = new Hono<{ Variables: {user: {id: string, table: 'attendee' | 'organiser', session: string}} }>()


attendee.get('/', verify_request(['attendee']), async c => {
  const user = c.get('user')
  const connection = (await db.query<[ConnectsWith[]]>(surql`SELECT * FROM connects_with WHERE out = ${new RecordId('attendee', user.id)};`))[0][0]
  if(!connection){ throw new HTTPException(404, { message: 'No connection was found' }) }
  const bridge = await db.select(connection.out)
  return c.json({
    approved: true,
    access_token: null,
    connection_id: connection.id.id.toString(),
    start_time: bridge.start_time,
    end_time: bridge.end_time
  })
})

attendee.post('/', async c => {
  const schema = z.object({
    password_hash: z.string({message: 'Password hash is required'}),
    password_salt: z.string({ message: 'Password salt is requred' }),
    meeting_tag: z.string({message: 'Meeting tag is required'}),
    public_key: z.string({message: 'Public key is required'}),
    keypair_salt: z.string({message: 'Key pair salt is required'}),
    name: z.string({ message: 'Name is required' })
  })
  
  const body = await c.req.json()
  const validation = schema.safeParse({
    password_hash: body.password_hash,
    meeting_tag: body.meeting_tag, 
    password_salt: body.password_salt, 
    public_key: body.public_key, 
    keypair_salt: body.keypair_salt,
    name: body.name
  })

  if(validation.success === false){ 
    const formatted = validation.error.format()
    let message: string = ''
    formatted._errors.forEach(val => message = `${val}; `)
    if(formatted.meeting_tag){ formatted.meeting_tag._errors.forEach(val => message = `${val}`) }
    if(formatted.password_hash){ formatted.password_hash?._errors.forEach(val => message = `${val}`) }
    if(formatted.password_salt){ formatted.password_salt?._errors.forEach(val => message = `${val}`) }
    if(formatted.public_key){ formatted.public_key?._errors.forEach(val => message = `${val}`) }
    if(formatted.keypair_salt){ formatted.keypair_salt?._errors.forEach(val => message = `${val}`) }
    if(formatted.name){ formatted.name?._errors.forEach(val => message = `${val}`) }
    throw new HTTPException(404, { message: message  }) 
  }

  const { meeting_tag, password_hash, password_salt, public_key, keypair_salt, name } = validation.data

  const organiser = (await db.query<[Organiser[]]>(surql`SELECT * FROM organiser WHERE meeting_tag = ${meeting_tag} LIMIT 1;`))[0][0]
  if(!organiser){ throw new HTTPException(400, { message: 'Action not allowed' }) }

  const response_tag = await generate_tag('attendee')
  const attendee_content: Partial<Attendee> = {
    password_salt: password_salt,
    password_hash: password_hash,
    response_tag: response_tag,
    public_key: public_key,
    keypair_salt: keypair_salt,
    expires_at: organiser.end_time,
    name: name
  }
  const [new_attendee] = await db.query<[Attendee]>(surql`CREATE ONLY attendee CONTENT ${attendee_content};`)
  await db.query<[RequestsTo[]]>(surql`RELATE ${new_attendee.id}->requests_to->${organiser.id};`)
  
  return c.json({
    response_tag: new_attendee.response_tag,
    meeting_tag: organiser.meeting_tag,
    start_time: organiser.start_time,
    end_time: organiser.end_time
  })
})

attendee.post('/auth/start', async c => {
  const schema = z.object({
    response_tag: z.string({message: 'Response tag is required'})
  })

  const body = await c.req.json()
  const validation = schema.safeParse({response_tag: body.response_tag})

  if(validation.success === false){ 
    const formatted = validation.error.format()
    let message: string = ''
    formatted._errors.forEach(val => message = `${val}`)
    if(formatted.response_tag){ formatted.response_tag?._errors.forEach(val => message = `${val}`) }
    throw new HTTPException(404, { message: message  }) 
  }

  const { response_tag } = validation.data

  const [attendee] = await db.query<[Attendee]>(surql`SELECT * FROM ONLY attendee WHERE response_tag = ${response_tag} LIMIT 1;`)
  if(!attendee){  throw new HTTPException(400,  { message: 'Attendee was not found' }) }

  const [organiser] = await db.query<[Organiser]>(surql`SELECT VALUE out.* FROM ONLY requests_to WHERE in = ${attendee.id} LIMIT 1;`)
  if(!organiser){ throw new HTTPException(400, { message: 'Meeting was not found' }) }

  // const login_content: Partial<Login> = {
  //   token: generate_key(),
  //   expires_at: new Date( Date.now() + 1000*60*1 ),
  //   user: attendee.id
  // }

  // const [login] = await db.query<[Login]>(surql`CREATE ONLY login CONTENT ${login_content}`)

  // if(!login){ throw new HTTPException(400, { message: 'Login token could not be created' }) }

  return c.json({
    password_salt: attendee.password_salt,
    response_tag: attendee.response_tag
  })
})

attendee.post('/auth/finish', async c => {
  const encoder = new TextEncoder()
  const schema = z.object({
    password_hash: z.string({message: 'Password hash is required'}),
    response_tag: z.string({message: 'Response tag is required'})
  })

  const body = await c.req.json()
  const validation = schema.safeParse({password_hash: body.password_hash, response_tag: body.response_tag})

  if(validation.success === false){ 
    const formatted = validation.error.format()
    let message: string = ''
    formatted._errors.forEach(val => message += `${val}; `)
    if(formatted.response_tag){ formatted.response_tag?._errors.forEach(val => message += `${val}; `) }
    if(formatted.password_hash){ formatted.password_hash?._errors.forEach(val => message += `${val}; `) }
    throw new HTTPException(404, { message: message  }) 
  }

  const { response_tag, password_hash } = validation.data

  const [attendee] = await db.query<[Attendee]>(surql`SELECT * FROM ONLY attendee WHERE response_tag = ${response_tag} LIMIT 1;`)
  if(!attendee){  throw new HTTPException(400,  { message: 'Attendee was not found' }) }

  const [organiser] = await db.query<[Organiser]>(surql`SELECT VALUE out.* FROM ONLY requests_to WHERE in = ${attendee.id} LIMIT 1;`)
  if(!organiser){ throw new HTTPException(400, { message: 'Meeting was not found' }) }

  const session = (await db.query<[number]>(surql`RETURN count(SELECT * FROM session WHERE user = ${attendee.id});`))[0]

  if(session > 0){ throw new HTTPException(400, { message: 'You have an active session elsewhere, logout first before proceeding' }) }

  const provided_secret = decodeHex(password_hash)
  const stored_secret = decodeHex(attendee.password_hash)
  const match = timingSafeEqual(stored_secret, provided_secret)

  if(match === false){ throw new HTTPException(400, { message: 'The response tag or the password is wrong' }) }

  const connection = (await db.query<[ConnectsWith[]]>(surql`SELECT * FROM connects_with WHERE in = ${organiser.id} AND out = ${attendee.id};`))[0][0]

  if(connection){
    const attendee_id = attendee.id.id.toString()
    const jwt_secret = Deno.env.get('JWT_SECRET')
    const jwt_expiration = new Date(organiser.end_time)
    if(!jwt_expiration || !jwt_secret){ throw new HTTPException(400, { message: 'Access token could not be generated' }) }
    const encodedSecret =  encoder.encode(jwt_secret)

    const { os, browser, device } = UAParser(c.req.header('User-Agent'))
    const session_content: Partial<Session> = {
      user: attendee.id,
      browser: browser.name ? browser.name : 'Unknown',
      device: device.type && device.vendor ? `${device.vendor} - ${device.type}` : 'Unknown',
      os: os.name ? os.name : 'Unknown',
      expires_at: new Date( organiser.end_time )
    }

    const [session] = await db.query<[Session]>(surql`CREATE ONLY session CONTENT ${session_content};`)

    const token = await new SignJWT({ id: attendee_id, sid: session.id.id.toString(), role: 'attendee' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(jwt_expiration).sign(encodedSecret)

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
      access_token: null,
      connection_id: null,
      start_time: organiser.start_time,
      end_time: organiser.end_time
    })
  }
})

export default attendee