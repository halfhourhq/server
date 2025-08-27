import { getCookie } from "@hono/hono/cookie"
import { HTTPException } from "@hono/hono/http-exception"
import { Context, Next } from "@hono/hono"
import { JWTPayload, jwtVerify } from "@panva/jose"
import { db } from "../database/config.ts"
import { RecordId, surql } from "@surrealdb/surrealdb"
import { Session } from "../routes/session/session.config.ts"

export function verify_request(roles: Array<'organiser' | 'attendee'>){
  return async (c: Context, next: Next) => {
    const unixTimestamp = Math.floor(Date.now()/1000)
    
    const bearer = c.req.header('Authorization')?.split(' ')[1] || getCookie(c, 'visitor_token') || getCookie(c, 'access_token')
    
    if(!bearer){ throw new HTTPException(401, {message: 'Access denied'}) }
    const jwt = bearer
    const encoder = new TextEncoder()
    const jwtSecret = Deno.env.get('JWT_SECRET')
    const encodedSecret =  encoder.encode(jwtSecret)
    const decodedJwt = await jwtVerify(jwt, encodedSecret)
    const payload: JWTPayload & {role?: 'organiser' | 'attendee', sid?: string, id?: string} =  decodedJwt['payload']
    
    if(!payload.exp || !payload.iat || !payload.role){
      throw new HTTPException(401, { message: 'Access denied' })
    }
    if(unixTimestamp > payload.exp || payload.iat > unixTimestamp || roles.indexOf(payload.role) < 0){
      throw new HTTPException(401, { message: 'Access denied' })
    }

    if(!payload.role || !payload.sid || !payload.id){ throw new HTTPException(401, { message: 'Badly formatted access token' }) }

    if(!roles.find(val => val === payload.role)){ throw new HTTPException(403, { message: 'You are not authorised' }) }

    if(payload.role === 'organiser'){
      if(!payload.sid){ throw new HTTPException(401, { message: 'Access denied' }) }
      const [session] = await db.query<[Session]>(surql`SELECT * FROM ONLY session WHERE id = ${new RecordId('session', payload.sid)} AND user = ${new RecordId(payload.role, payload.id)} LIMIT 1;`)
      if(!session){ throw new HTTPException(401, { message: 'Session not found' }) }
      if(Date.now() > new Date(session.expires_at).valueOf()){ throw new HTTPException(401, { message: 'Your session has expired' }) }
    }

    if(payload.role === 'attendee'){
      if(!payload.sid){ throw new HTTPException(401, { message: 'Access denied' }) }
      const [session] = await db.query<[Session]>(surql`SELECT * FROM ONLY session WHERE id = ${new RecordId('session', payload.sid)} AND user = ${new RecordId(payload.role, payload.id)} LIMIT 1;`)
      if(!session){ throw new HTTPException(401, { message: 'Session not found' }) }
      if(Date.now() > new Date(session.expires_at).valueOf()){ throw new HTTPException(401, { message: 'Your session has expired' }) }
    }

    c.set('user', {
      id: payload.id,
      table: payload.role,
      session: payload.sid
    })
    await next()
  }
}