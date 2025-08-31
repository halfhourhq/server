import { HTTPException } from "@hono/hono/http-exception"
import { Hono } from "@hono/hono"
import { z }  from "zod"
import { upgradeWebSocket } from "@hono/hono/deno"
import { verify_request } from "../../misc/verify_request.util.ts"
import { Organiser } from "../organiser/organiser.config.ts"
import { PreparedQuery, RecordId, surql } from "@surrealdb/surrealdb"
import { db } from "../../database/config.ts"
import { Attendee } from "../attendee/attendee.config.ts"
import { ConnectsWith, ConversationWith, Message } from "./meeting.config.ts"
import { WSContext } from "@hono/hono/ws"
import { broadcast_message } from "../../misc/broadcast_message.util.ts";

const meeting = new Hono<{ Variables: {user: {id: string, table: 'attendee' | 'organiser', session: string}} }>()

const conversations = new Map<string, Map<string, WSContext<WebSocket>>>()
const all_messages = new Map<string, Set<ConversationWith>>()

meeting.post('/connect', verify_request(['organiser']), async c => {
  const user = c.get('user')
  const schema = z.string({message: 'Response tag is required'})

  const body = await c.req.json()
  const validation =  schema.safeParse(body.response_tag)

  if(validation.success === false){ 
    const formatted = validation.error.format()
    let message: string = ''
    formatted._errors.forEach(val => message = `${val}`)
    throw new HTTPException(404, { message: message  }) 
  }

  const response_tag = validation.data

  const organiser = await db.select<Organiser>(new RecordId('organiser', user.id))
  if(!organiser){  throw new HTTPException(400, { message: 'Meeting not found' }) }

  const [attendee] = await db.query<[Attendee]>(surql`SELECT * FROM ONLY attendee WHERE response_tag = ${response_tag} LIMIT 1;`)
  if(!attendee){ throw new HTTPException(400, { message: 'The attendee response does not exist' }) }

  const has_requested = (await db.query<Array<number>>(surql`RETURN count(SELECT * FROM requests_to WHERE in = ${attendee.id} AND out = ${organiser.id});`))[0]
  if(has_requested === 0){ throw new HTTPException(400, { message: 'Forbidden is connection' }) }

  const [connects] = await db.query<[number]>(surql`RETURN count(SELECT * FROM connects_with WHERE in = ${organiser.id});`)
  if(connects > 0){ throw new HTTPException(400, { message: 'Only one connected attendee per meeting is allowed' }) }

  await db.query(surql`RELATE ${organiser.id}->connects_with->${attendee.id};`)

  return c.json({connection: 'successful'})
})

meeting.get('/connection/:id', verify_request(['organiser', 'attendee']), async c => {
  const user = c.get('user')
  const connection_id = c.req.param('id')
  let query: PreparedQuery
  
  switch(user.table){
    case 'organiser':
      query = surql`SELECT * FROM ONLY connects_with WHERE id = ${new RecordId('connects_with', connection_id)} AND in = ${new RecordId('organiser', user.id)} LIMIT 1;`
      break;
    case 'attendee':
      query = surql`SELECT * FROM ONLY connects_with WHERE id = ${new RecordId('connects_with', connection_id)} AND out = ${new RecordId('attendee', user.id)} LIMIT 1;`
      break;
  }

  const [connection] = await db.query<[ConnectsWith]>(query)
  if(!connection){ throw new HTTPException(403, { message: 'Meeting not found' }) }

  const organiser = await db.select<Organiser>(connection.in)
  const attendee = await db.select<Attendee>(connection.out)
  const text = (await db.query<Array<ConversationWith[]>>(surql`SELECT * FROM conversation_with WHERE out = ${connection.id} ORDER created_at ASC LIMIT 100;`))[0]
  const [total_storage] = await db.query<[number]>(surql`
    RETURN math::sum(SELECT VALUE size FROM file WHERE organiser = ${organiser.id} AND is_complete = ${true});
  `).catch(error => { throw new HTTPException(404, { message: error.message }) })

  return c.json({
    connection_id: connection.id,
    organiser_id: organiser.id,
    organiser_name: organiser.name,
    organiser_key: organiser.public_key,
    organiser_keypair_salt: organiser.keypair_salt,
    attendee_id: attendee.id,
    attendee_name: attendee.name,
    attendee_key: attendee.public_key,
    attendee_keypair_salt: attendee.keypair_salt,
    start_time: organiser.start_time,
    end_time: organiser.end_time,
    created_at: organiser.created_at,
    meeting_tag: organiser.meeting_tag,
    response_tag: attendee.response_tag,
    messages: text,
    total_storage: total_storage
  })
})

meeting.get('/realtime/:id', verify_request(['organiser', 'attendee']), async (c, next) => {
  const user = c.get('user')
  const connection_id = c.req.param('id')
  let query: PreparedQuery

  switch(user.table){
    case 'organiser':
      query = surql`SELECT * FROM ONLY connects_with WHERE id = ${new RecordId('connects_with', connection_id)} AND in = ${new RecordId('organiser', user.id)} LIMIT 1;`
      break;
    case 'attendee':
      query = surql`SELECT * FROM ONLY connects_with WHERE id = ${new RecordId('connects_with', connection_id)} AND out = ${new RecordId('attendee', user.id)} LIMIT 1;`
      break;
  }

  const [connection] = await db.query<[ConnectsWith]>(query)
  if(!connection){ throw new HTTPException(403, { message: 'Meeting not found' }) }

  const organiser = await db.select<Organiser>(connection.in)
  const attendee = await db.select<Attendee>(connection.out)

  if(!attendee || !organiser){ throw new HTTPException(403, { message: 'The connection is not allowed' }) }

  if(organiser.start_time > new Date()){ throw new HTTPException(403, { message: 'The connection is not active yet' }) }
  if(organiser.end_time < new Date()){ throw new HTTPException(403, { message: 'The connection is not longer active' }) }
  await next()
}, upgradeWebSocket(async c => {
  const user:  {id: string, table: 'canal' | 'wave', session: string} = c.get('user')

  let user_id: RecordId<string>
  const meet = await db.select<ConnectsWith>(new RecordId('connects_with', c.req.param('id')))

  if(user.table === 'canal'){
    user_id = meet.out
  } else {
    user_id = meet.in
  }

  const organiser = await db.select<Organiser>(meet.in)

  const conversation = conversations.get(meet.id.toString()) ?? new Map<string, WSContext<WebSocket>>()
  const messages = all_messages.get(meet.id.toString()) ?? new Set<ConversationWith>()
  
  return {
    onMessage: async (event, ws) => {

      const value = event.data as string
      try {

        const msg: Message = JSON.parse(value)
        const now = new Date()

        switch(msg.type){
          case 'text': {

            interface Content {
              body: string
              has_attachment: boolean
              attachment?: RecordId<string>
            }
            const content: Content = {
              body: msg.data.message,
              has_attachment: msg.data.file ? true : false
            }

            if(msg.data.file){ 
              content.attachment = new RecordId('file', msg.data.file)

              const storage = (
                await db.query<[number]>(surql`
                  RETURN math::sum(SELECT VALUE size FROM file WHERE organiser = ${organiser.id} AND is_complete = ${true});
                `).catch(_error => { 
                  ws.send(JSON.stringify({
                    type: 'error',
                    data: {
                      from: user_id.toString(),
                      message: 'Your message could be sent.',
                      created_at: now
                    }
                  }))
                })
              )

              if(storage){
                broadcast_message({
                  clients: conversation,
                  sender: user_id.toString(),
                  everywhere: true,
                  message: JSON.stringify({
                    type: 'storage',
                    data: storage[0]
                  })
                })
              }
            }

            const saved = (await db.query<[ConversationWith[]]>(surql`
              RELATE ${user_id}->conversation_with->${meet.id} CONTENT ${content};
            `).catch(_err => {
              ws.send(JSON.stringify({
                type: 'error',
                data: {
                  from: user_id.toString(),
                  message: 'Your message could be sent.',
                  created_at: now
                }
              }))
            }))

            if(saved){
              const message = saved[0][0]
              messages.add(message)
              all_messages.set(meet.id.toString(), messages)
              broadcast_message({
                clients: conversation,
                sender: user_id.toString(),
                everywhere: true,
                message: JSON.stringify({
                  type: 'text',
                  data: message
                })
              })
            }

            break;

          }
          case 'typing':
            broadcast_message({
              clients: conversation,
              sender: user_id.toString(),
              everywhere: false,
              message: JSON.stringify({
                type: 'typing',
                data: {
                  from: user_id.toString(),
                  message: 'Typing...',
                  created_at: now
                }
              })
            })
            break;
          case 'joined': {

            broadcast_message({
              clients: conversation,
              sender: user_id.toString(),
              everywhere: false,
              message: JSON.stringify({
                type: 'joined',
                data: {
                  from: user_id.toString(),
                  message: `${user_id.toString()} has joined`,
                  created_at: now
                }
              })
            })

            conversation.forEach((_client, id) => {
              if(id !== user_id.toString()){
                ws.send(JSON.stringify({
                  type: 'joined',
                data: {
                    from: id,
                    message: `${id} has joined`,
                    created_at: now
                  }
                }))
              }
            })

            break;

          }
          case 'left': {

            broadcast_message({
              clients: conversation,
              sender: user_id.toString(),
              everywhere: false,
              message: JSON.stringify({
                type: 'left',
                data: {
                  from: user_id.toString(),
                  message: `${user_id.toString()} has left`,
                  created_at: now
                }
              })
            })
            break;

          }
        }

      } catch (_error) {
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Error processing your message' }
        }))
      }
    },
    onOpen: (_event, ws) => {

      const now = new Date()
      if(conversation.size >= 2 && !conversation.has(user_id.toString())){ 
        ws.send(JSON.stringify({
          type: 'error',
          data: {
            message: 'This bridge is fully occupied',
            from: user_id.toString(),
            created_at: now
          }
        }))
        ws.close()
      } else {
        conversation.set(user_id.toString(), ws)
        conversations.set(meet.id.toString(),  conversation)

        ws.send(JSON.stringify({
          type: 'text_history',
          data: Array.from(messages)
        }))

        broadcast_message({
          clients: conversation,
          sender: user_id.toString(),
          everywhere: false,
          message: JSON.stringify({
            type: 'joined',
            data: {
              from: user_id.toString(),
              message: `${user_id.toString()} has joined`,
              created_at: now
            }
          })
        })
      }

    },
    onClose: (_event, _ws) => {
      const now = new Date()
      conversation.delete(user_id.toString())
      conversations.set(meet.id.toString(), conversation)
      
      broadcast_message({
        clients: conversation,
        sender: user_id.toString(),
        everywhere: false,
        message: JSON.stringify({
          type: 'left',
          data: {
            from: user_id.toString(),
            message: `${user_id.toString()} has left`,
            created_at: now
          }
        })
      })
      if(conversation.size === 0){ conversations.delete(meet.id.toString()) }

    },
    onError: (_event, ws) => {
      const now = new Date()
      conversation.delete(user_id.toString())
      conversations.set(meet.id.toString(), conversation)
      ws.close(1002, `You have encountered an error.`)
      broadcast_message({
        clients: conversation,
        sender: user_id.toString(),
        everywhere: false,
        message: JSON.stringify({
          type: 'left',
          data: {
            from: user_id.toString(),
            message: `${user_id.toString()} has left`,
            created_at: now
          }
        })
      })
      if(conversation.size === 0){ conversations.delete(meet.id.toString()) }
    }
  }
}, {
  protocol: 'chat'
}))

export default meeting