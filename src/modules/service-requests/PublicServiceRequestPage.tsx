import { FormEvent, useEffect, useState } from "react";
import { santaMariaRequestSectors } from "../../config/santaMariaSectors";
import {
  getPublicServiceRequestErrorMessage,
  submitPublicServiceRequest,
} from "./services/serviceRequestService";
import type { PublicServiceRequestReceipt } from "./types/serviceRequest.types";
import "./serviceRequests.css";

function createSubmissionId() {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto && typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (browserCrypto && typeof browserCrypto.getRandomValues === "function") {
    browserCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function PublicServiceRequestPage() {
  const [submissionId, setSubmissionId] = useState(createSubmissionId);
  const [requesterName, setRequesterName] = useState("");
  const [department, setDepartment] = useState("");
  const [requestText, setRequestText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<PublicServiceRequestReceipt | null>(null);

  useEffect(() => {
    document.title = "Abrir chamado | HUB Santa Maria";
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setMessage("");
    setSubmitting(true);
    try {
      const nextReceipt = await submitPublicServiceRequest({
        submissionId,
        requesterName,
        department,
        requestText,
      });
      setReceipt(nextReceipt);
    } catch (error) {
      setMessage(getPublicServiceRequestErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function startAnotherRequest() {
    setSubmissionId(createSubmissionId());
    setRequesterName("");
    setDepartment("");
    setRequestText("");
    setMessage("");
    setReceipt(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="public-request-page">
      <section className="public-request-shell">
        <header className="public-request-brand">
          <span className="public-request-logo" aria-hidden="true">T</span>
          <div>
            <strong>HUB Santa Maria</strong>
            <span>Central de Chamados</span>
          </div>
        </header>

        {receipt ? (
          <section className="public-request-success" aria-live="polite">
            <span className="public-request-success-icon" aria-hidden="true">✓</span>
            <p className="public-request-eyebrow">Chamado enviado</p>
            <h1>Solicitação registrada com sucesso</h1>
            <p>Seu chamado foi encaminhado para o Tezzei.</p>

            <article className="public-request-receipt">
              <span>Protocolo</span>
              <strong>{formatProtocol(receipt.protocolNumber, receipt.openedAt)}</strong>
              <small>{formatDateTime(receipt.openedAt)}</small>
            </article>

            <p className="public-request-keep-protocol">
              Guarde o número do protocolo caso precise identificar esta solicitação.
            </p>

            <button className="public-request-primary" type="button" onClick={startAnotherRequest}>
              Abrir outro chamado
            </button>
          </section>
        ) : (
          <section className="public-request-card">
            <p className="public-request-eyebrow">Solicitação interna</p>
            <h1>O que você precisa?</h1>
            <p className="public-request-intro">
              Informe os dados abaixo. O chamado será enviado diretamente para o responsável pelo atendimento.
            </p>

            <form onSubmit={handleSubmit}>
              <label>
                <span>Seu nome *</span>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(event) => setRequesterName(event.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  placeholder="Digite seu nome"
                  required
                />
              </label>

              <label>
                <span>Seu setor *</span>
                <select
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  required
                >
                  <option value="" disabled>Selecione o setor</option>
                  {santaMariaRequestSectors.map((sector) => (
                    <option key={sector} value={sector}>{sector}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>O que você precisa? *</span>
                <textarea
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  rows={6}
                  minLength={5}
                  maxLength={3000}
                  placeholder="Explique de forma simples o que precisa ser feito"
                  required
                />
                <small className="public-request-counter">{requestText.length}/3000</small>
              </label>

              {message && <p className="public-request-error" role="alert">{message}</p>}

              <button className="public-request-primary" type="submit" disabled={submitting}>
                {submitting ? "Enviando..." : "Enviar chamado"}
              </button>
            </form>
          </section>
        )}

        <footer className="public-request-footer">
          SANTA MARIA SOLUÇÕES IMOBILIÁRIAS
        </footer>
      </section>
    </main>
  );
}

function formatProtocol(protocolNumber: number, openedAt: string) {
  const year = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(openedAt));
  return `CH-${year}-${String(protocolNumber).padStart(6, "0")}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
