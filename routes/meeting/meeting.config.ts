import { RecordId } from "@surrealdb/surrealdb"
import { WSContext } from "@hono/hono/ws"

/* INTERFACES */

export interface Broadcaster {
  clients: Map<string, WSContext<WebSocket>>, 
  sender: string, 
  everywhere: boolean, 
  message: string
}

export interface Message {
  type: 'text' | 'error' | 'joined' | 'left' | 'typing' | 'text_sent'
  data: {
    message: string
    file?: string
  }
}

/* TYPES */

export type ConnectsWith = {
  id: RecordId<string>
  in: RecordId<string> // Organiser
  out: RecordId<string> // Attendee
  created_at: string
}

export type ConversationWith =  {
  id: RecordId<string>
  in: RecordId<string> // Attendee || Organiser
  out: RecordId<string> // ConnectsWith 
  body: string
  has_attachment: boolean
  attachment?: RecordId<string> // File
  created_at: string
}

export const connects_with_table = {
  table: 'DEFINE TABLE connects_with SCHEMAFULL TYPE RELATION IN organiser OUT attendee;',
  fields: {
    created_at: 'DEFINE FIELD created_at ON TABLE connects_with TYPE datetime DEFAULT time::now() READONLY;'
  },
  indices: {
    unique_in_out: 'DEFINE INDEX unique_in_out ON TABLE connects_with FIELDS in, out UNIQUE;',
    unique_in: 'DEFINE INDEX unique_in ON TABLE connects_with FIELDS in UNIQUE;',
    unique_out: 'DEFINE INDEX unique_out ON TABLE connects_with FIELDS out UNIQUE;'
  }
}

export const conversation_with_table = {
  table: 'DEFINE TABLE conversation_with SCHEMAFULL TYPE RELATION IN organiser|attendee OUT connects_with;',
  fields: {
    body: 'DEFINE FIELD body ON TABLE conversation_with TYPE string ASSERT string::len($value) < 1000;',
    has_attachment: 'DEFINE FIELD has_attachment ON TABLE conversation_with TYPE bool;',
    attachment: 'DEFINE FIELD attachment ON TABLE conversation_with TYPE option<record<file>>;',
    created_at: 'DEFINE FIELD created_at ON TABLE conversation_with TYPE datetime DEFAULT time::now() READONLY;'
  }
}