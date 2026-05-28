// Hand-written Supabase Database type matching supabase/migrations/0001_*.
//
// Regenerate with `supabase gen types typescript --project-id qtknfcplbxgtmrzxocfu`
// if/when the schema grows enough to make hand-maintenance painful.

export interface Database {
  public: {
    Tables: {
      user_keys: {
        Row: {
          user_id: string
          salt: string
          kdf_iterations: number
          wrapped_dek_password: string
          wrapped_dek_password_iv: string
          wrapped_dek_recovery: string
          wrapped_dek_recovery_iv: string
          created_at: string
        }
        Insert: {
          user_id: string
          salt: string
          kdf_iterations?: number
          wrapped_dek_password: string
          wrapped_dek_password_iv: string
          wrapped_dek_recovery: string
          wrapped_dek_recovery_iv: string
          created_at?: string
        }
        Update: {
          user_id?: string
          salt?: string
          kdf_iterations?: number
          wrapped_dek_password?: string
          wrapped_dek_password_iv?: string
          wrapped_dek_recovery?: string
          wrapped_dek_recovery_iv?: string
          created_at?: string
        }
        Relationships: []
      }
      maps: {
        Row: {
          id: string
          user_id: string
          name_ct: string
          name_iv: string
          data_ct: string
          data_iv: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          name_ct: string
          name_iv: string
          data_ct: string
          data_iv: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name_ct?: string
          name_iv?: string
          data_ct?: string
          data_iv?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      delete_self: {
        Args: Record<string, never>
        Returns: void
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
