import { surql } from "@surrealdb/surrealdb"
import { db } from "../database/config.ts"
import { HTTPException } from "@hono/hono/http-exception"
import { letter_sequence } from "./letter_sequence.util.ts";

export async function generate_tag(user_type: 'organiser' | 'attendee') {
  let attempts = 0
  const maxAttempts = (await db.query<Array<number>>(surql`RETURN count(SELECT * FROM type::table(${user_type}));`))[0]+100

  while(attempts < maxAttempts){
    const tag = letter_sequence(3)

    try {
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