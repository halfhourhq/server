import { RecordId } from "@surrealdb/surrealdb"

export type Attendee = {
  id: RecordId<string>
  name: string
  password_hash: string
  password_salt: string
  response_tag: string
  public_key: string
  keypair_salt: string
  expires_at: Date
  created_at: string
  updated_at: string
}

export type RequestsTo = {
  id: RecordId<string>
  in: RecordId<string> // Attendee
  out: RecordId<string> // Organiser
  created_at: string
}

export const attendee_table = {
  table: 'DEFINE TABLE attendee SCHEMAFULL;',
  fields: {
    name: `DEFINE FIELD name ON TABLE attendee TYPE string;`,
    response_tag: 'DEFINE FIELD response_tag ON TABLE attendee TYPE string;',
    public_key: 'DEFINE FIELD public_key ON TABLE attendee TYPE string;',
    keypair_salt: 'DEFINE FIELD keypair_salt ON TABLE attendee TYPE string;',
    password_hash: 'DEFINE FIELD password_hash ON TABLE attendee TYPE string;',
    password_salt: 'DEFINE FIELD password_salt ON TABLE attendee TYPE string;',
    expires_at: 'DEFINE FIELD expires_at ON TABLE attendee TYPE datetime;',
    created_at: 'DEFINE FIELD created_at ON TABLE attendee TYPE datetime DEFAULT time::now() READONLY;',
    updated_at: 'DEFINE FIELD updated_at ON TABLE attendee TYPE datetime DEFAULT time::now();'
  },
  indices: {
    unique_response_tag: 'DEFINE INDEX unique_response_tag ON TABLE attendee FIELDS response_tag UNIQUE;'
  }
}

export const requests_to_table = {
  table: 'DEFINE TABLE requests_to SCHEMAFULL TYPE RELATION IN attendee OUT organiser;',
  fields: {
    created_at: 'DEFINE FIELD created_at ON TABLE requests_to TYPE datetime DEFAULT time::now() READONLY;'
  },
  indices: {
    unique_in_out: 'DEFINE INDEX unique_in_out ON TABLE requests_to FIELDS in, out UNIQUE;',
    unique_in: 'DEFINE INDEX unique_in ON TABLE requests_to FIELDS in UNIQUE;',
    unique_out: 'DEFINE INDEX unique_out ON TABLE requests_to FIELDS out UNIQUE;'
  }
}