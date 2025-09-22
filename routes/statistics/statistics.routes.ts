import { Hono } from "@hono/hono"
import { status_file } from "../../misc/clean_file.task.ts"
import { status_attendee } from "../../misc/clean_attendee.task.ts"
import { status_organiser } from "../../misc/clean_organiser.task.ts"
import { status_session } from "../../misc/clean_session.task.ts"
import { db } from "../../database/config.ts"

const statistics = new Hono<{ Variables: {user: {id: string, table: 'attendee' | 'organiser', session: string}} }>()

statistics.get('/jobs', c => {
  const files = status_file()
  const attendees = status_attendee()
  const organisers = status_organiser()
  const sessions = status_session()
  return c.json({
    files,
    attendees,
    organisers,
    sessions
  })
})

statistics.get('/meetings', async c => {
  const [
    total_storage, 
    total_messages, 
    total_active_connections, 
    total_upcoming_connections, 
    total_upcoming_invites, 
    total_active_invites,
    median_responses,
    mode_responses,
    max_responses
  ] = await db.query<[number, number, number, number, number, number, number, number, number]>(`
    RETURN math::sum(SELECT VALUE size FROM file WHERE is_complete = ${true});
    RETURN math::sum(SELECT VALUE count(id) as individual FROM conversation_with);
    RETURN math::sum(SELECT VALUE count(id) as individual FROM connects_with WHERE in.start_time < time::now() AND in.end_time > time::now());
    RETURN math::sum(SELECT VALUE count(id) as individual FROM connects_with WHERE in.start_time > time::now());
    RETURN math::sum(SELECT VALUE count(id) as individual FROM organiser WHERE start_time > time::now());
    RETURN math::sum(SELECT VALUE count(id) as individual FROM organiser WHERE start_time < time::now() AND end_time > time::now());
    RETURN math::median((SELECT count(id) as organiser, out FROM requests_to GROUP BY out).organiser);
    RETURN math::mode((SELECT count(id) as organiser, out FROM requests_to GROUP BY out).organiser);
    RETURN math::max((SELECT count(id) as organiser, out FROM requests_to GROUP BY out).organiser);
  `)
  
  return c.json({
    total_storage, 
    total_messages, 
    total_active_connections, 
    total_upcoming_connections, 
    total_upcoming_invites, 
    total_active_invites,
    median_responses: median_responses ? median_responses : null,
    mode_responses: mode_responses ? mode_responses : null,
    max_responses: max_responses ? max_responses : null
  })
})


export default statistics