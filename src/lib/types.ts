// Tipos compartilhados entre servidor e cliente.
import type { Role } from "./rules.ts";

export interface ShellAppt { id: string; date: string; time: string; plate: string | null; reason: string | null; reminder_sent_at: string | null; customer_name: string; customer_phone: string }
export interface ShellBill { id: string; description: string | null; category: string; amount: number; due_date: string; payment_code: string | null; paid: boolean; paid_on: string | null; source: string; purchase_id: string | null }
export interface ShellData {
  me: { id: string; full_name: string; role: Role; shop_id: string };
  shopName: string;
  patio: number; servico: number; parados: number; hojeAgendados: number;
  amanha: ShellAppt[];
  contas: ShellBill[];          // só master/admin
  fatMes: number; ticketMes: number;
}
