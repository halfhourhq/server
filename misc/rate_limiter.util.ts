import { Context, Next } from "@hono/hono"
import { getConnInfo } from "@hono/hono/deno"
import { kv } from "../database/kv.ts"
import { HTTPException } from "@hono/hono/http-exception"

export async function rate_limiter(c: Context, next: Next) {
  interface Access {
    requests: number
    expires_at: number
  }
  const address = c.req.header('X-Forwarded-For') || getConnInfo(c).remote.address
  const ip = (await kv.get<Access>(['requests', address])).value
  if(!ip){
    await kv.set(['requests', address], { requests: 1, expires_at: Date.now()+(1000*60) }, { expireIn: 1000*60 })
  } else if(ip.expires_at < Date.now()){
    await kv.set(['requests', address], { requests: 1, expires_at: Date.now()+(1000*60) }, { expireIn: 1000*60 })
  } else if(ip.expires_at >= Date.now() && ip.requests >= 10){
    throw new HTTPException(429, { message: 'You have reached the maximum 10 requests per minute' })
  } else if(ip.expires_at >= Date.now() && ip.requests < 10){
    await kv.set(['requests', address], { requests: ++ip.requests, expires_at: ip.expires_at })
  }
  await next()
}