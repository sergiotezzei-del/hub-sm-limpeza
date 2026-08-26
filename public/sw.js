const CACHE_NAME = "hub-santa-maria-v14";
const MARKETING_PUSH_CACHE = "hub-marketing-push-state";
const LAST_MARKETING_PUSH_KEY = "/__hub_last_marketing_push";
const MARKETING_PUSH_ENDPOINT = "https://dtdepfpkyiqtnsjztjit.supabase.co/functions/v1/marketing-public-push";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME && key !== MARKETING_PUSH_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "🔔 Atualização do Marketing",
      body: event.data ? event.data.text() : "Abra o HUB para conferir seu agendamento.",
      data: { url: "/marketing/notificacoes" },
    };
  }

  const title = payload.title || "🔔 Atualização do Marketing";
  const data = payload.data || {};
  const options = {
    body: payload.body || "Abra o HUB para conferir seu agendamento.",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    tag: payload.tag || `marketing-push-${Date.now()}`,
    data: {
      ...data,
      url: data.url || "/marketing/notificacoes",
    },
    requireInteraction: payload.requireInteraction !== false,
    renotify: payload.renotify !== false,
    silent: false,
    vibrate: [300, 120, 300, 120, 650],
    actions: [
      { action: "view", title: "VER AGENDAMENTO" },
    ],
  };

  event.waitUntil(Promise.all([
    rememberMarketingPush(payload),
    notifyOpenClients(payload),
    setMarketingBadge(),
    self.registration.showNotification(title, options),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification?.data || {};
  const targetUrl = data.url || "/";
  const ackToken = data.ackToken || "";
  event.notification.close();

  event.waitUntil((async () => {
    if (ackToken) await acknowledgeMarketingPush(ackToken);
    await clearMarketingBadge();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached || Response.error());
      return network;
    }),
  );
});

async function rememberMarketingPush(payload) {
  try {
    const cache = await caches.open(MARKETING_PUSH_CACHE);
    await cache.put(
      LAST_MARKETING_PUSH_KEY,
      new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    // O push nativo ainda será mostrado mesmo se o cache falhar.
  }
}

async function notifyOpenClients(payload) {
  try {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: "hub:marketing-push", payload }));
  } catch {
    // A notificação do sistema continua sendo a via principal em segundo plano.
  }
}

async function acknowledgeMarketingPush(ackToken) {
  try {
    await fetch(MARKETING_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ack", ackToken }),
    });
  } catch {
    // Se a confirmação falhar, o servidor enviará outro lembrete; isso é mais seguro do que marcar como visto sem confirmação.
  }
}

async function setMarketingBadge() {
  try {
    if (self.navigator && typeof self.navigator.setAppBadge === "function") {
      await self.navigator.setAppBadge(1);
    }
  } catch {
    // Nem todos os sistemas suportam badge.
  }
}

async function clearMarketingBadge() {
  try {
    if (self.navigator && typeof self.navigator.clearAppBadge === "function") {
      await self.navigator.clearAppBadge();
    }
  } catch {
    // Badge é complementar.
  }
}
