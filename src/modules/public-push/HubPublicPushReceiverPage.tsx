import { useEffect, useState } from "react";
import { SantaMariaBrand } from "../../components/SantaMariaBrand";
import { HubPublicPushSetupCard } from "./HubPublicPushSetupCard";
import {
  readPendingHubPublicPushSetup,
  sourceLabel,
  sourceUrl,
  type HubPublicPushSetup,
} from "./hubPublicPushClient";
import "./hubPublicPush.css";

export function HubPublicPushReceiverPage() {
  const [setup] = useState<HubPublicPushSetup | null>(() => readPendingHubPublicPushSetup());

  useEffect(() => {
    document.title = "Notificações | HUB Santa Maria";
  }, []);

  return (
    <main className="hub-public-push-receiver-page">
      <section className="hub-public-push-receiver-shell">
        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <SantaMariaBrand className="panel-corner-brand" />
          <div>
            <strong style={{ display: "block" }}>HUB Santa Maria</strong>
            <span style={{ color: "#64748b" }}>Notificações</span>
          </div>
        </header>

        {setup ? (
          <>
            <HubPublicPushSetupCard setup={setup} contextLabel={sourceLabel(setup.sourceType)} />
            <p style={{ marginTop: 14, textAlign: "center" }}>
              <a href={sourceUrl(setup.sourceType)}>Voltar para a solicitação</a>
            </p>
          </>
        ) : (
          <section className="hub-public-push-card">
            <div className="hub-public-push-icon">✓</div>
            <div className="hub-public-push-content">
              <p className="hub-public-push-kicker">HUB SANTA MARIA</p>
              <h2>Nenhuma ativação pendente.</h2>
              <p className="hub-public-push-lead">Abra novamente o link da solicitação para vincular este aparelho.</p>
              <p><a href="/">Abrir HUB</a></p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
