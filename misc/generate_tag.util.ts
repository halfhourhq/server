import { surql } from "@surrealdb/surrealdb"
import { db } from "../database/config.ts"
import { diceware } from "./diceware.util.ts"
import { HTTPException } from "@hono/hono/http-exception"

export async function generate_tag(user_type: 'organiser' | 'attendee') {
  let attempts = 0
  const maxAttempts = (await db.query<Array<number>>(surql`RETURN count(SELECT * FROM type::table(${user_type}));`))[0]+100

  while(attempts < maxAttempts){
    try {
      const tag = '#'+(await diceware(3)).join('_')

      if(user_type === 'organiser'){
        const match = (await db.query<[number]>(surql`RETURN count(SELECT * FROM type::table(${user_type}) WHERE meeting_tag = ${tag});`))[0]
        if(match === 0){
          return tag
        }
      } else {
        const match = (await db.query<[number]>(surql`RETURN count(SELECT * FROM type::table(${user_type}) WHERE response_tag = ${tag});`))[0]
        if(match === 0){
          return tag
        }
      }

      attempts++
    } catch (error) {
      throw new HTTPException(400, { message: 'Could not generate tag', cause: error })
    }
  }
  
  throw new HTTPException(400, { message: `Failed to generate tag after ${attempts} attempts` })
}