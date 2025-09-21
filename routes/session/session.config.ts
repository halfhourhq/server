import { RecordId } from "@surrealdb/surrealdb"

export type Session = {
  id: RecordId<string>
  user: RecordId<string> // Attendee || Organiser
  browser: string
  device: string
  os: string
  created_at: Date
  expires_at: Date
}

export type Login = {
  id: RecordId<string>
  user: RecordId<string> // Attendee || Organiser
  token: string
  created_at: Date
  expires_at: Date
}

export const session_table = {
  table: 'DEFINE TABLE session SCHEMAFULL;',
  fields: {
    user: 'DEFINE FIELD user ON TABLE session TYPE record<attendee|organiser>;',
    browser: 'DEFINE FIELD browser ON TABLE session TYPE string;',
    device: 'DEFINE FIELD device ON TABLE session TYPE string;',
    os: 'DEFINE FIELD os ON TABLE session TYPE string;',
    created_at: `DEFINE FIELD created_at ON TABLE session TYPE datetime DEFAULT time::now() READONLY;`,
    expires_at: `DEFINE FIELD expires_at ON TABLE session TYPE datetime;`
  },
  indices: {
    unique_user: 'DEFINE INDEX unique_user ON TABLE session FIELDS user UNIQUE;'
  }
}

export const login_table = {
  table: 'DEFINE TABLE login SCHEMAFULL;',
  fields: {
    user: 'DEFINE FIELD user ON TABLE login TYPE record<attendee|organiser>;',
    token: 'DEFINE FIELD token ON TABLE login TYPE string;',
    created_at: `DEFINE FIELD created_at ON TABLE login TYPE datetime DEFAULT time::now() READONLY;`,
    expires_at: `DEFINE FIELD expires_at ON TABLE login TYPE datetime;`
  },
  indices: {
    unique_user: 'DEFINE INDEX unique_user ON TABLE login FIELDS user UNIQUE;'
  }
}