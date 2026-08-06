export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      allowed_users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          full_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      otp_logs: {
        Row: {
          id: string
          code: string
          sender: string
          subject: string | null
          gmail_message_id: string
          received_at: string
          expires_at: string
          status: 'active' | 'expired'
        }
        Insert: {
          id?: string
          code: string
          sender: string
          subject?: string | null
          gmail_message_id: string
          received_at?: string
          expires_at: string
          status?: 'active' | 'expired'
        }
        Update: {
          id?: string
          code?: string
          sender?: string
          subject?: string | null
          gmail_message_id?: string
          received_at?: string
          expires_at?: string
          status?: 'active' | 'expired'
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
