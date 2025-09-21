// deno-lint-ignore-file no-explicit-any
import { PreparedQuery } from '@surrealdb/surrealdb'
import { db } from "../database/config.ts"
import { organiser_table } from "../routes/organiser/organiser.config.ts"
import { attendee_table, requests_to_table } from "../routes/attendee/attendee.config.ts"
import { connects_with_table, conversation_with_table } from "../routes/meeting/meeting.config.ts"
import { login_table, session_table } from "../routes/session/session.config.ts"
import { file_table, opened_by_table } from "../routes/storage/storage.config.ts"

export async function startup(){
  try {
    const database_info = await db.query<any[]>('INFO FOR DB;')
    const tables = Object.entries(database_info[0].tables).map(tab => tab[0])

    if(tables.indexOf('organiser') < 0){
      const schema =  `${organiser_table.table}\n` + Object.values(organiser_table.fields).join('\n') + Object.values(organiser_table.indices).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else { 
      const organiser_info = await db.query<any[]>('INFO FOR TABLE organiser;')

      const present_fields = Object.entries(organiser_info[0].fields).map(field => field[0])
      for(const field in organiser_table.fields){
        const key = field as keyof typeof organiser_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(organiser_table.fields[key])
        }
      }

      const present_indexes = Object.entries(organiser_info[0].indexes).map(field => field[0])
      for(const index in organiser_table.indices){
        const key = index as keyof typeof organiser_table.indices;
        if(present_indexes.indexOf(key) < 0){
          await db.query(organiser_table.indices[key])
        }
      }
    }

    if(tables.indexOf('attendee') < 0){
      const schema =  `${attendee_table.table}\n` + Object.values(attendee_table.fields).join('\n') + Object.values(attendee_table.indices).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else { 
      const attendee_info = await db.query<any[]>('INFO FOR TABLE attendee;')

      const present_fields = Object.entries(attendee_info[0].fields).map(field => field[0])
      for(const field in attendee_table.fields){
        const key = field as keyof typeof attendee_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(attendee_table.fields[key])
        }
      }

      const present_indexes = Object.entries(attendee_info[0].indexes).map(field => field[0])
      for(const index in attendee_table.indices){
        const key = index as keyof typeof attendee_table.indices;
        if(present_indexes.indexOf(key) < 0){
          await db.query(attendee_table.indices[key])
        }
      }
    }

    if(tables.indexOf('requests_to') < 0){
      const schema =  `${requests_to_table.table}\n` + Object.values(requests_to_table.fields).join('\n') + Object.values(requests_to_table.indices).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else { 
      const requestsTo_info = await db.query<any[]>('INFO FOR TABLE requests_to;')

      const present_fields = Object.entries(requestsTo_info[0].fields).map(field => field[0])
      for(const field in requests_to_table.fields){
        const key = field as keyof typeof requests_to_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(requests_to_table.fields[key])
        }
      }

      const present_indexes = Object.entries(requestsTo_info[0].indexes).map(field => field[0])
      for(const index in requests_to_table.indices){
        const key = index as keyof typeof requests_to_table.indices;
        if(present_indexes.indexOf(key) < 0){
          await db.query(requests_to_table.indices[key])
        }
      }
    }

    if(tables.indexOf('connects_with') < 0){
      const schema =  `${connects_with_table.table}\n` + Object.values(connects_with_table.fields).join('\n') + Object.values(connects_with_table.indices).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else { 
      const connectsWith_info = await db.query<any[]>('INFO FOR TABLE connects_with;')

      const present_fields = Object.entries(connectsWith_info[0].fields).map(field => field[0])
      for(const field in connects_with_table.fields){
        const key = field as keyof typeof connects_with_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(connects_with_table.fields[key])
        }
      }

      const present_indexes = Object.entries(connectsWith_info[0].indexes).map(field => field[0])
      for(const index in connects_with_table.indices){
        const key = index as keyof typeof connects_with_table.indices;
        if(present_indexes.indexOf(key) < 0){
          await db.query(connects_with_table.indices[key])
        }
      }
    }

    if(tables.indexOf('conversation_with') < 0){
      const schema =  `${conversation_with_table.table}\n` + Object.values(conversation_with_table.fields).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else { 
      const conversationWith_info = await db.query<any[]>('INFO FOR TABLE conversation_with;')
      const present_fields = Object.entries(conversationWith_info[0].fields).map(field => field[0])
      for(const field in conversation_with_table.fields){
        const key = field as keyof typeof conversation_with_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(conversation_with_table.fields[key])
        }
      }
    }

    if(tables.indexOf('session') < 0){
      const schema =  `${session_table.table}\n` + Object.values(session_table.fields).join('\n') + Object.values(session_table.indices).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else { 
      const session_info = await db.query<any[]>('INFO FOR TABLE session;')

      const present_fields = Object.entries(session_info[0].fields).map(field => field[0])
      for(const field in session_table.fields){
        const key = field as keyof typeof session_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(session_table.fields[key])
        }
      }

      const present_indexes = Object.entries(session_info[0].indexes).map(field => field[0])
      for(const index in session_table.indices){
        const key = index as keyof typeof session_table.indices;
        if(present_indexes.indexOf(key) < 0){
          await db.query(session_table.indices[key])
        }
      }
    }

    if(tables.indexOf('login') < 0){
      const schema =  `${login_table.table}\n` + Object.values(login_table.fields).join('\n') + Object.values(login_table.indices).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else { 
      const login_info = await db.query<any[]>('INFO FOR TABLE login;')

      const present_fields = Object.entries(login_info[0].fields).map(field => field[0])
      for(const field in login_table.fields){
        const key = field as keyof typeof login_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(login_table.fields[key])
        }
      }

      const present_indexes = Object.entries(login_info[0].indexes).map(field => field[0])
      for(const index in login_table.indices){
        const key = index as keyof typeof login_table.indices;
        if(present_indexes.indexOf(key) < 0){
          await db.query(login_table.indices[key])
        }
      }
    }

    if(tables.indexOf('file') < 0){
      const schema =  `${file_table.table}\n` + Object.values(file_table.fields).join('\n') + Object.values(file_table.indices).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else { 
      const file_info = await db.query<any[]>('INFO FOR TABLE file;')

      const present_fields = Object.entries(file_info[0].fields).map(field => field[0])
      for(const field in file_table.fields){
        const key = field as keyof typeof file_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(file_table.fields[key])
        }
      }

      const present_indexes = Object.entries(file_info[0].indexes).map(field => field[0])
      for(const index in file_table.indices){
        const key = index as keyof typeof file_table.indices;
        if(present_indexes.indexOf(key) < 0){
          await db.query(file_table.indices[key])
        }
      }
    }

    if(tables.indexOf('opened_by') < 0){
      const schema =  `${opened_by_table.table}\n` + Object.values(opened_by_table.fields).join('\n') + Object.values(opened_by_table.indices).join('\n');
      const definition = new PreparedQuery(schema)
      await db.query(definition)
    } else {
      const opened_by_info = await db.query<any[]>('INFO FOR TABLE opened_by;')

      const present_fields = Object.entries(opened_by_info[0].fields).map(field => field[0])
      for(const field in opened_by_table.fields){
        const key = field as keyof typeof opened_by_table.fields;
        if(present_fields.indexOf(key) < 0){
          await db.query(opened_by_table.fields[key])
        }
      }

      const present_indexes = Object.entries(opened_by_info[0].indexes).map(field => field[0])
      for(const index in opened_by_table.indices){
        const key = index as keyof typeof opened_by_table.indices;
        if(present_indexes.indexOf(key) < 0){
          await db.query(opened_by_table.indices[key])
        }
      }
    }
  } catch (error) {
    throw new Error('Database preparation failed', { cause: error })
  }
}