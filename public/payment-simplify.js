(() => {
  const SCREEN_SELECTOR = ".guards-payment-screen";

  const moneyToNumber = (value) => {
    const cleaned = String(value || "").replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatBRL = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatDateShortFromInput = (value) => {
    if (!value) return "XX/XX";
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    return `${parts[2]}/${parts[1]}`;
  };

  const cleanShiftLine = (line) => {
    let text = String(line || "").replace(/\s+/g, " ").trim();
    text = text.replace(/\s*\([^)]*\)/g, "");
    text = text.replace(/-/g, " ").replace(/\s+/g, " ").trim();
    text = text.replace(/\bnoturno\b/i, "noite");
    text = text.replace(/\bdiurno\b/i, "dia");
    text = text.replace(/\bextra\b/i, "dia");
    text = text.replace(/feriado.*$/i, "").trim() + (text.toLowerCase().includes("feriado") ? " + feriado 1/2 dia" : "");
    if (/jogo|copa/i.test(line)) text += " + plantão referente ao jogo da Copa";
    return text.replace(/\s+/g, " ").trim();
  };

  const getTextWithoutSmall = (element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("small").forEach((small) => small.remove());
    return clone.textContent || "";
  };

  const getLabelInputValue = (card, labelText) => {
    const labels = [...card.querySelectorAll("label")];
    const label = labels.find((item) => (item.childNodes[0]?.textContent || item.textContent || "").trim().toLowerCase().startsWith(labelText.toLowerCase()));
    const input = label?.querySelector("input, textarea, select");
    return input?.value?.trim() || "";
  };

  const getProfilesByGuard = (screen) => {
    const map = new Map();
    screen.querySelectorAll(".payment-profile-card").forEach((card) => {
      const operationalName = card.querySelector(".monitoring-card-head span")?.textContent?.trim() || "";
      if (!operationalName) return;
      map.set(operationalName, {
        paymentName: getLabelInputValue(card, "Nome para pagamento"),
        bank: getLabelInputValue(card, "Banco"),
        agency: getLabelInputValue(card, "Agência") || getLabelInputValue(card, "Agencia"),
        accountType: getLabelInputValue(card, "Tipo de conta") || "Conta Corrente",
        account: getLabelInputValue(card, "Conta"),
        cpf: getLabelInputValue(card, "CPF"),
        pix: getLabelInputValue(card, "Pix"),
      });
    });
    return map;
  };

  const getPeriodData = (screen) => {
    const dateInputs = [...screen.querySelectorAll(".payment-config-card input[type='date']")];
    return {
      start: dateInputs[0]?.value || "",
      end: dateInputs[1]?.value || "",
      paymentDate: dateInputs[2]?.value || "",
    };
  };

  const parseGuardCard = (card, profile) => {
    const guardNameRaw = card.querySelector(".monitoring-card-head span")?.textContent?.trim() || "";
    const guardTitle = guardNameRaw === "Salomão" ? "Ricardo Salomão" : guardNameRaw;
    const totalText = card.querySelector(".monitoring-card-head strong")?.textContent || "";
    const total = moneyToNumber(totalText);
    const mini = [...card.querySelectorAll(".payment-mini-grid small")];
    const getMiniValue = (label) => {
      const item = mini.find((node) => node.textContent?.toLowerCase().includes(label.toLowerCase()));
      return moneyToNumber(item?.querySelector("b")?.textContent || item?.textContent || "0");
    };
    const base = getMiniValue("Base");
    const holiday = getMiniValue("Extra feriado");
    const other = getMiniValue("Plantão/outros");
    const shifts = [...card.querySelectorAll(".payment-shift-line")]
      .map((item) => cleanShiftLine(getTextWithoutSmall(item)))
      .filter(Boolean);

    return {
      guardTitle,
      profile,
      base,
      holiday,
      other,
      total,
      shifts,
    };
  };

  const buildOfficialFinanceMessage = () => {
    const screen = document.querySelector(SCREEN_SELECTOR);
    if (!screen) return "";
    const period = getPeriodData(screen);
    const profiles = getProfilesByGuard(screen);
    const rows = [...screen.querySelectorAll(".payment-guard-card")].map((card) => {
      const name = card.querySelector(".monitoring-card-head span")?.textContent?.trim() || "";
      return parseGuardCard(card, profiles.get(name) || {});
    });
    const totalGeneral = rows.reduce((total, row) => total + row.total, 0);
    const lines = [
      "Bom dia.",
      "",
      `Segue pagamento dos guardas referente ao período de ${formatDateShortFromInput(period.start)} a ${formatDateShortFromInput(period.end)}.`,
      "",
    ];

    rows.forEach((row) => {
      const profile = row.profile || {};
      lines.push(row.guardTitle, "");
      if (row.shifts.length === 0) lines.push("Sem dias conferidos no período.");
      row.shifts.forEach((shift) => lines.push(shift));
      lines.push(
        "",
        `Base quinzenal: ${formatBRL(row.base || 1000)}`,
        `Extra feriado 1/2 dia: ${formatBRL(row.holiday)}`,
        `Outros extras: ${formatBRL(row.other)}`,
        "",
        `Banco: ${profile.bank || "--"}`,
        `Agência: ${profile.agency || "--"}`,
        `Conta Corrente: ${profile.account || "--"}`,
        `CPF: ${profile.cpf || "--"}`,
      );
      if (profile.pix) lines.push(`Pix: ${profile.pix}`);
      lines.push(
        `Nome: ${profile.paymentName || "--"}`,
        `Valor: ${formatBRL(row.total)}`,
        "",
        ""
      );
    });

    lines.push(`Total geral: ${formatBRL(totalGeneral)}`);
    return lines.join("\n").trim();
  };

  const setTextareaValue = (textarea, value) => {
    if (!textarea) return;
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const showFeedback = (screen, text) => {
    let feedback = screen.querySelector(".payment-simplify-feedback");
    if (!feedback) {
      feedback = document.createElement("p");
      feedback.className = "success-message payment-simplify-feedback";
      const section = screen.querySelector(".payment-report-section");
      section?.insertBefore(feedback, section.children[1] || null);
    }
    feedback.textContent = text;
  };

  const simplifyPaymentScreen = () => {
    const screen = document.querySelector(SCREEN_SELECTOR);
    if (!screen) return;

    screen.querySelectorAll(".success-message").forEach((message) => {
      const text = message.textContent || "";
      if (/carregad[oa]s?.*supabase/i.test(text) || /dados de pagamento carregad/i.test(text)) {
        message.style.display = "none";
      }
    });

    const head = screen.querySelector(".payment-report-head");
    const title = head?.querySelector("strong");
    if (title) title.textContent = "Fechamento dos Guardas";

    const profileSection = screen.querySelector(".payment-profile-section");
    if (profileSection && !profileSection.querySelector(".payment-profile-toggle-button")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button payment-profile-toggle-button";
      button.textContent = "Editar dados de pagamento dos guardas";
      button.addEventListener("click", () => {
        profileSection.classList.toggle("payment-profile-open");
        button.textContent = profileSection.classList.contains("payment-profile-open")
          ? "Ocultar dados de pagamento dos guardas"
          : "Editar dados de pagamento dos guardas";
      });
      profileSection.appendChild(button);
    }

    const textarea = screen.querySelector(".payment-message-card textarea");
    if (textarea && !textarea.dataset.officialFinanceMessage) {
      textarea.dataset.officialFinanceMessage = "true";
      setTextareaValue(textarea, buildOfficialFinanceMessage());
    }
  };

  document.addEventListener("click", async (event) => {
    const button = event.target?.closest?.("button");
    if (!button) return;
    const label = (button.textContent || "").trim();
    const screen = document.querySelector(SCREEN_SELECTOR);
    if (!screen || !screen.contains(button)) return;

    if (label === "Gerar mensagem para financeiro") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const message = buildOfficialFinanceMessage();
      setTextareaValue(screen.querySelector(".payment-message-card textarea"), message);
      showFeedback(screen, "Mensagem para financeiro gerada no modelo oficial.");
    }

    if (label === "Copiar mensagem") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const message = buildOfficialFinanceMessage();
      setTextareaValue(screen.querySelector(".payment-message-card textarea"), message);
      try {
        await navigator.clipboard.writeText(message);
        showFeedback(screen, "Mensagem para financeiro copiada.");
      } catch {
        showFeedback(screen, "Não foi possível copiar a mensagem.");
      }
    }
  }, true);

  const observer = new MutationObserver(() => simplifyPaymentScreen());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", simplifyPaymentScreen);
  setInterval(simplifyPaymentScreen, 1000);
})();
