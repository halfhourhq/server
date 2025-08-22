import { Hono } from "@hono/hono"
import { logger } from "@hono/hono/logger"
import { cors } from "@hono/hono/cors"
import { HTTPException } from "@hono/hono/http-exception"
import { startup } from "./database/startup.ts"
import meeting from "./routes/meeting/meeting.routes.ts"
import session from "./routes/session/session.routes.ts"
import storage from "./routes/storage/storage.routes.ts"
import attendee from "./routes/attendee/attendee.routes.ts"
import organiser from "./routes/organiser/organiser.routes.ts"

const app = new Hono()

await startup()

const client = Deno.env.get('CLIENT_URL')
if(!client){ throw new Error('Provide a client host string') }

app.use(logger())
app.use((c, next) => {
  if(c.req.path.startsWith('/meeting/realtime/') || c.req.path.startsWith('/meeting/connection/')){
    return next()
  } else {
    const corsHandler = cors({
      origin: client,
      credentials: true
    })
    return corsHandler(c, next)
  }
})

app.onError((error, c) => {
  if(error instanceof HTTPException){
    return error.getResponse()
  }
  const message = error instanceof Error ? error.message : 'Unexpected error'
  return c.text(message, 500)
})

app.get('/', c => c.text('You deserve privacy'))
app.route('/attendee', attendee)
app.route('/organiser', organiser)
app.route('/meeting', meeting)
app.route('/session', session)
app.route('/storage', storage)

const port = Number(Deno.env.get('PORT')) ?? 6002
Deno.serve({port: port}, app.fetch)