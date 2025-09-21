import { Context, Next } from "@hono/hono"
import { getConnInfo } from "@hono/hono/deno"
import { kv } from "../database/kv.ts"
import { HTTPException } from "@hono/hono/http-exception"

export async function rate_limiter(c: Context, next: Next) {
  interface Access {
    requests: number
    expires_at: number
  }
  const info = getConnInfo(c)
  const ip = (await kv.get<Access>(['requests', info.remote.address])).value
  if(!ip){
    await kv.set(['requests', info.remote.address], { requests: 1, expires_at: Date.now()+(1000*60) }, { expireIn: 1000*60 })
  } else if(ip.expires_at < Date.now()){
    await kv.set(['requests', info.remote.address], { requests: 1, expires_at: Date.now()+(1000*60) }, { expireIn: 1000*60 })
  } else if(ip.expires_at >= Date.now() && ip.requests >= 15){
    throw new HTTPException(429, { message: 'You have reached the maximum 10 requests per minute' })
  } else if(ip.expires_at >= Date.now() && ip.requests < 15){
    await kv.set(['requests', info.remote.address], { requests: ++ip.requests, expires_at: ip.expires_at })
  }
  await next()
}