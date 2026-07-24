export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      configuracao_fluxo: {
        Row: {
          ativo: boolean
          condicao: Json | null
          empresa_id: string
          id: string
          integracao: string | null
          nome_etapa: string
          obrigatoria: boolean
          ordem: number
          papel_id: string | null
          produto: string
          regra_saida: Json | null
          responsavel_tipo: string
          sla_horas: number | null
        }
        Insert: {
          ativo?: boolean
          condicao?: Json | null
          empresa_id: string
          id?: string
          integracao?: string | null
          nome_etapa: string
          obrigatoria?: boolean
          ordem: number
          papel_id?: string | null
          produto: string
          regra_saida?: Json | null
          responsavel_tipo: string
          sla_horas?: number | null
        }
        Update: {
          ativo?: boolean
          condicao?: Json | null
          empresa_id?: string
          id?: string
          integracao?: string | null
          nome_etapa?: string
          obrigatoria?: boolean
          ordem?: number
          papel_id?: string | null
          produto?: string
          regra_saida?: Json | null
          responsavel_tipo?: string
          sla_horas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracao_fluxo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracao_fluxo_papel_id_fkey"
            columns: ["papel_id"]
            isOneToOne: false
            referencedRelation: "papeis_empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          created_at: string | null
          empresa_id: string
          fase_atual_id: string | null
          fornecedor_nome: string | null
          id: string
          numero: number
          status: string
          titulo: string
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          created_at?: string | null
          empresa_id: string
          fase_atual_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero?: number
          status?: string
          titulo: string
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: string
          fase_atual_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero?: number
          status?: string
          titulo?: string
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_fase_atual_fkey"
            columns: ["fase_atual_id"]
            isOneToOne: false
            referencedRelation: "fases_config"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          analise_ia: Json | null
          id: string
          nome_arquivo: string | null
          solicitacao_id: string
          tipo: string
          uploaded_at: string | null
          url: string
        }
        Insert: {
          analise_ia?: Json | null
          id?: string
          nome_arquivo?: string | null
          solicitacao_id: string
          tipo: string
          uploaded_at?: string | null
          url: string
        }
        Update: {
          analise_ia?: Json | null
          id?: string
          nome_arquivo?: string | null
          solicitacao_id?: string
          tipo?: string
          uploaded_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_produtos: {
        Row: {
          ativo: boolean
          data_contratacao: string | null
          empresa_id: string
          id: string
          produto: string
        }
        Insert: {
          ativo?: boolean
          data_contratacao?: string | null
          empresa_id: string
          id?: string
          produto: string
        }
        Update: {
          ativo?: boolean
          data_contratacao?: string | null
          empresa_id?: string
          id?: string
          produto?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas_clientes: {
        Row: {
          cnpj: string | null
          created_at: string | null
          id: string
          modelo_negocio: string | null
          nome: string
          segmento_setorial: string | null
          slug: string
          status: string
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          id?: string
          modelo_negocio?: string | null
          nome: string
          segmento_setorial?: string | null
          slug: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          id?: string
          modelo_negocio?: string | null
          nome?: string
          segmento_setorial?: string | null
          slug?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      etapas_execucao: {
        Row: {
          comentario: string | null
          configuracao_fluxo_id: string
          created_at: string | null
          decidido_em: string | null
          decidido_por: string | null
          id: string
          papel_resolvido_id: string | null
          solicitacao_id: string
          status: string
        }
        Insert: {
          comentario?: string | null
          configuracao_fluxo_id: string
          created_at?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          papel_resolvido_id?: string | null
          solicitacao_id: string
          status?: string
        }
        Update: {
          comentario?: string | null
          configuracao_fluxo_id?: string
          created_at?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          papel_resolvido_id?: string | null
          solicitacao_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "etapas_execucao_configuracao_fluxo_id_fkey"
            columns: ["configuracao_fluxo_id"]
            isOneToOne: false
            referencedRelation: "configuracao_fluxo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_execucao_papel_resolvido_id_fkey"
            columns: ["papel_resolvido_id"]
            isOneToOne: false
            referencedRelation: "papeis_empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_execucao_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      fases_config: {
        Row: {
          ativo: boolean
          empresa_id: string
          id: string
          nome_fase: string
          ordem: number
          produto: string
        }
        Insert: {
          ativo?: boolean
          empresa_id: string
          id?: string
          nome_fase: string
          ordem: number
          produto: string
        }
        Update: {
          ativo?: boolean
          empresa_id?: string
          id?: string
          nome_fase?: string
          ordem?: number
          produto?: string
        }
        Relationships: [
          {
            foreignKeyName: "fases_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_status: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          nota: string | null
          solicitacao_id: string
          status: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          nota?: string | null
          solicitacao_id: string
          status: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          nota?: string | null
          solicitacao_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_status_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      membros: {
        Row: {
          created_at: string | null
          empresa_id: string
          id: string
          papel_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          empresa_id: string
          id?: string
          papel_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          empresa_id?: string
          id?: string
          papel_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_papel_id_fkey"
            columns: ["papel_id"]
            isOneToOne: false
            referencedRelation: "papeis_empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      papeis_empresa: {
        Row: {
          empresa_id: string
          id: string
          nome: string
        }
        Insert: {
          empresa_id: string
          id?: string
          nome: string
        }
        Update: {
          empresa_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "papeis_empresa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          email: string | null
          full_name: string | null
          id: string
          is_super_admin: boolean
        }
        Insert: {
          email?: string | null
          full_name?: string | null
          id: string
          is_super_admin?: boolean
        }
        Update: {
          email?: string | null
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
        }
        Relationships: []
      }
      solicitacoes: {
        Row: {
          contrato_id: string | null
          created_at: string | null
          data_vencimento: string | null
          empresa_id: string
          fase_id: string | null
          fornecedor_nome: string | null
          id: string
          numero: number
          produto: string
          solicitante_id: string | null
          status: string
          titulo: string
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          contrato_id?: string | null
          created_at?: string | null
          data_vencimento?: string | null
          empresa_id: string
          fase_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero?: number
          produto: string
          solicitante_id?: string | null
          status?: string
          titulo: string
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          contrato_id?: string | null
          created_at?: string | null
          data_vencimento?: string | null
          empresa_id?: string
          fase_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero?: number
          produto?: string
          solicitante_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_fase_id_fkey"
            columns: ["fase_id"]
            isOneToOne: false
            referencedRelation: "fases_config"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplicar_modelo_empresarial_padrao: {
        Args: { p_empresa_id: string }
        Returns: undefined
      }
      aplicar_modelo_setorial_profissional: {
        Args: { p_empresa_id: string; p_segmento: string }
        Returns: undefined
      }
      has_empresa_role: {
        Args: { p_empresa_id: string; roles: string[] }
        Returns: boolean
      }
      has_produto_ativo: {
        Args: { p_empresa_id: string; p_produto: string }
        Returns: boolean
      }
      is_empresa_member: { Args: { p_empresa_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
