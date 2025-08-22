import { HTTPException } from "@hono/hono/http-exception"
import { Hono } from "@hono/hono"
import { Session } from "./session.config.ts"
import { RecordId } from "@surrealdb/surrealdb"
import { db } from "../../database/config.ts"
import { verify_request } from "../../misc/verify_request.util.ts";

const session = new Hono<{ Variables: {user: {id: string, table: 'attendee' | 'organiser', session: string}} }>()

session.get('/', async c => {
  const id = c.req.query('id')
  if(!id){ throw new HTTPException(404, { message: 'Provide the session id' }) }
  const session = await db.select<Session>(new RecordId('session', id))
  if(!session){ throw new HTTPException(404, { message: 'Session not found' }) }
  if(new Date(session.expires_at) < new Date()){ throw new HTTPException(404, { message: 'Session has expired' }) }
  return c.json({
    valid: true,
    expires_at: session.expires_at
  })
})

session.delete('/', verify_request(['attendee', 'organiser']), async c => {
  const user = c.get('user')
  await db.delete(new RecordId('session', user.session))
  return c.json({ status: 'success' })
})

export default session