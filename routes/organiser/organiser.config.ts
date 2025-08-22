import { RecordId } from "@surrealdb/surrealdb"

export type Organiser = {
  id: RecordId<string>
  name: string
  meeting_tag: string
  public_key: string
  keypair_salt: string
  password_hash: string
  password_salt: string
  start_time: Date
  end_time: Date
  created_at: Date
  updated_at: Date
}

export const organiser_table = {
  table: 'DEFINE TABLE organiser SCHEMAFULL;',
  fields: {
    name: `DEFINE FIELD name ON TABLE organiser TYPE string DEFAULT 'Sailor' READONLY;`,
    meeting_tag: 'DEFINE FIELD meeting_tag ON TABLE organiser TYPE string;',
    public_key: 'DEFINE FIELD public_key ON TABLE organiser TYPE string;',
    keypair_salt: 'DEFINE FIELD keypair_salt ON TABLE organiser TYPE string;',
    password_hash: 'DEFINE FIELD password_hash ON TABLE organiser TYPE string;',
    password_salt: 'DEFINE FIELD password_salt ON TABLE organiser TYPE string;',
    start_time: 'DEFINE FIELD start_time ON TABLE organiser TYPE datetime;',
    end_time: 'DEFINE FIELD end_time ON TABLE organiser TYPE datetime;',
    created_at: 'DEFINE FIELD created_at ON TABLE organiser TYPE datetime DEFAULT time::now() READONLY;',
    updated_at: 'DEFINE FIELD updated_at ON TABLE organiser TYPE datetime DEFAULT time::now();'
  },
  indices: {
    unique_meeting_tag: 'DEFINE INDEX unique_meeting_tag ON TABLE organiser FIELDS meeting_tag UNIQUE;',
  }
}