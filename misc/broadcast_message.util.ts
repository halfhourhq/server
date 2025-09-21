import { Broadcaster } from "../routes/meeting/meeting.config.ts";

export function broadcast_message(info: Broadcaster){
  if(info.everywhere){
    info.clients.forEach(client => { client.send(info.message) })
  } else {
    info.clients.forEach((client, id) => {
      if(id !== info.sender){ client.send(info.message) }
    })
  }
}