import { RecordId } from "@surrealdb/surrealdb"

export type OpenedBy = {
  id: RecordId<string>
  in: RecordId<string> // File
  out: RecordId<string> // Organiser || Attendee
  created_at: string
}

export type File = {
  id: RecordId<string>
  organiser: RecordId<string>
  b2_file_id: string
  downloads_count: number
  downloads_total: number
  name: string
  original_filename: string
  content_type: string
  sha1: string
  size: number
  is_complete: boolean
  expires_at: Date
  created_at: Date
  updated_at: Date
}

export const file_table = {
  table: 'DEFINE TABLE file SCHEMAFULL;',
  fields: {
    organiser: 'DEFINE FIELD organiser ON TABLE file TYPE record<organiser>;',
    b2_file_id: 'DEFINE FIELD b2_file_id ON TABLE file TYPE string;',
    downloads_count: 'DEFINE FIELD downloads_count ON TABLE file TYPE number;',
    downloads_total: 'DEFINE FIELD downloads_total ON TABLE file TYPE number;',
    name: 'DEFINE FIELD name ON TABLE file TYPE string;',
    original_filename: 'DEFINE FIELD original_filename ON TABLE file TYPE string;',
    content_type: 'DEFINE FIELD content_type ON TABLE file TYPE string;',
    sha1: 'DEFINE FIELD sha1 ON TABLE file TYPE string;',
    size: 'DEFINE FIELD size ON TABLE file TYPE number;',
    is_complete: 'DEFINE FIELD is_complete ON TABLE file TYPE bool;',
    expires_at: 'DEFINE FIELD expires_at ON TABLE file TYPE datetime;',
    created_at: 'DEFINE FIELD created_at ON TABLE file TYPE datetime DEFAULT time::now() READONLY;',
    updated_at: 'DEFINE FIELD updated_at ON TABLE file TYPE datetime DEFAULT ALWAYS time::now();'
  },
  indices: {
    unique_b2_file_id: 'DEFINE INDEX unique_b2_file_id ON TABLE file FIELDS b2_file_id UNIQUE;'
  }
}

export const opened_by_table = {
  table: 'DEFINE TABLE opened_by SCHEMAFULL TYPE RELATION IN file OUT organiser|attendee;',
  fields: {
    created_at: 'DEFINE FIELD created_at ON TABLE opened_by TYPE datetime DEFAULT time::now() READONLY;'
  },
  indices: {}
}