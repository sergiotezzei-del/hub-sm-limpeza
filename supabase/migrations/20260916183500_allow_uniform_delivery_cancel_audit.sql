-- Preserve all existing audit action types and allow the new audited void.
ALTER TABLE public.patrimony_audit_log DROP CONSTRAINT patrimony_audit_log_action_check;
ALTER TABLE public.patrimony_audit_log ADD CONSTRAINT patrimony_audit_log_action_check CHECK (
  action IN (
    'person_notebook_update', 'notebook_item_update', 'person_inactivation',
    'notebook_transfer', 'uniform_delivery', 'uniform_return',
    'uniform_stock_receipt', 'uniform_term_attachment', 'uniform_term_print',
    'person_document_update', 'uniform_delivery_correction', 'uniform_delivery_cancel'
  )
);
