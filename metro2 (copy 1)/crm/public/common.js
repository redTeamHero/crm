/* public/common.js */

// Escape HTML entities for safe DOM insertion
export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// Consistent currency formatter used across UI modules
export function formatCurrency(val) {
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? '—' : `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Lightweight analytics helper exposed globally
function trackEvent(name, props = {}) {
  if (window.plausible) {
    window.plausible(name, { props });
  } else {
    console.debug('trackEvent', name, props);
  }
}
if (typeof window !== 'undefined') window.trackEvent = trackEvent;


const LANGUAGE_STORAGE_KEY = 'crm_language';
const DEFAULT_LANGUAGE = 'en';

const TRANSLATIONS = {
  en: {
    language: { name: 'English', code: 'EN', switchTo: 'Switch to {language}' },
    brand: 'Metro 2 CRM',
    nav: {
      dashboard: 'Dashboard',
      clients: 'Clients',
      leads: 'Leads',
      schedule: 'Schedule',
      billing: 'Billing',
      marketing: 'Marketing',
      settings: 'Settings',
      myCompany: 'My Company',
      letters: 'Letter',
      library: 'Library',
      workflows: 'Workflows',
      tradelines: 'Tradelines'
    },
    buttons: {
      menu: 'Menu',
      help: 'Help',
      helpTip: 'Help (H)',
      invite: 'Add Team Member',
      invitePlus: 'Invite +',
      addTeamMember: 'Add Team Member',
      logout: 'Logout'
    },
    prompts: {
      teammateEmail: 'Teammate email?',
      teammateName: 'Teammate name?',
      inviteFailed: 'Failed to invite member'
    },
    badges: {
      tooltip: "You've started your journey."
    },
    marketing: {
      meta: { title: 'Marketing' },
      hero: {
        title: 'Marketing Launchpad',
        subtitle: 'Plan premium credit-repair journeys, nurture leads, and prep conversion-focused automations before you wire them into Twilio, SendGrid, or any integration.',
        tip: 'Tip: document every bilingual (EN/ES) touchpoint to stay compliant, boost trust, and prime upsells. Once the backend hooks are live, these tiles can push payloads directly to your automation queue.'
      },
      smsBuilder: {
        heading: 'SMS Campaign Builder',
        description: 'Craft compliant outreach, personalize with merge fields, and preview the mobile experience before launch.',
        kpi: 'Suggested KPI: Reply Rate',
        upsell: 'Upsell: SMS Concierge Follow-up',
        experiment: 'A/B Test: “Book Call” vs “Discover your plan”',
        campaignName: 'Campaign Name',
        campaignPlaceholder: 'Fall Promo Launch',
        recipientLabel: 'Recipient Group',
        recipients: {
          leads: 'All Leads',
          newClients: 'New Clients (≤30 days)',
          inactive: 'Inactive Accounts (90+ days)',
          truckers: 'Owner-Operators / Truckers'
        },
        messageLabel: 'Message',
        messagePlaceholder: 'Hi {{first_name}}, we spotted a dispute update ready for review. Tap to confirm your next step.',
        insertMerge: 'Insert Merge Field',
        personalize: '+ Personalize',
        characterLabel: 'Character Count:',
        guardrails: 'Guardrails: opt-out copy auto-appended, rate-limited when live.',
        previewButton: 'Preview SMS',
        sendTestButton: 'Send Test',
        previewBadge: 'Preview • Twilio Ready',
        previewNote: 'Personalization sample uses demo data. Final send will use live CRM fields.'
      },
      emailBuilder: {
        heading: 'Email Template Designer',
        description: 'Organize nurture flows, automate bilingual onboarding, and prep branded sends before you connect SendGrid or Postalytics.',
        metricChip: 'Metric: Open → Consult %',
        automationChip: 'Automation idea: 7-day roadmap drip',
        experimentChip: 'CTA Test: “Schedule Strategy Call” vs “Explore your plan”',
        newTemplate: 'New Template',
        importHtml: 'Import HTML',
        filterLabel: 'Segment',
        filters: {
          all: 'All Segments',
          b2c: 'B2C Consumers',
          b2b: 'B2B / Truckers',
          attorneys: 'Attorneys / Referrals'
        },
        filterHelper: 'Filter to prep tailored automations.',
        emptyState: 'Templates load from the backend. Use “New Template” to save your first design.',
        loading: 'Loading templates from API…',
        errorPrefix: 'API error: ',
        template: {
          badgeFallback: 'Custom',
          draftLabel: 'Draft',
          editButton: 'Edit',
          editAlert: 'Hook up your template editor to template {title}. Use /api/marketing/templates to persist changes.'
        },
        prompts: {
          name: 'Template name?',
          purpose: 'What\'s the purpose?',
          descriptionFallback: 'Outline your nurture touchpoints and CTA.',
          error: 'Failed to save template: {error}',
          importReminder: 'POST your HTML to /api/marketing/templates with { html } once your inline CSS pipeline is ready.'
        }
      },
      campaignDashboard: {
        heading: 'Campaign Dashboard Preview',
        description: 'Visual placeholders ready to display Twilio/SendGrid metrics, pipeline revenue, and compliance alerts.',
        recentCampaigns: 'Recent Campaigns',
        exportCsv: 'Export CSV',
        statuses: {
          scheduled: 'Scheduled',
          completed: 'Completed',
          draft: 'Draft'
        },
        cards: {
          newYear: {
            title: 'New Year Credit Boost',
            body: 'Next touch: Jan 3 • Segment: Inactive Accounts • KPI target: 18% consult rate.'
          },
          trucker: {
            title: 'Trucker Safety + Credit Webinar',
            body: 'Result: 24 booked consults • Upsell opportunity: Fleet compliance retainer.'
          },
          scoreDrop: {
            title: 'Score Drop Alert',
            body: 'Set webhook to Metro-2 anomaly detector • CTA: Schedule dispute strategy.'
          }
        },
        metrics: {
          heading: 'Metrics Placeholder',
          badge: 'API ready',
          placeholder: '<span>Drop chart.js or Recharts here.</span><span>Map open %, click %, revenue per send.</span>',
          bullets: {
            track: '• Track: Lead → Consult %, Consult → Paid %, Refund %',
            alerts: '• Alerts: Opt-out spikes, deliverability drops',
            next: '• Next: Slack webhook for at-risk campaigns'
          }
        },
        experiments: {
          heading: 'Experiments Queue',
          item1: '1️⃣ Pricing anchor: “$49 Strategy Session” vs “$0 Discovery”',
          item2: '2️⃣ CTA microcopy: “Start audit” vs “Start your audit”',
          item3: '3️⃣ Social proof position: testimonials vs score visualizer',
          logButton: 'Log Hypothesis',
          prompt: 'Log your experiment hypothesis',
          customPrefix: '{index}️⃣ {idea}'
        }
      },
      integration: {
        heading: 'Integration Checklist',
        description: 'Wire this UI to Twilio, SendGrid, and other services without losing compliance.',
        stepsTitle: 'Steps to Activate',
        steps: {
          collect: 'Collect API keys and SIDs; store them in <code>.env</code> or Settings → Integrations.',
          providers: 'Call <code>PATCH /api/marketing/providers/:id</code> to mark providers as <span class="font-semibold">ready</span>.',
          tests: 'Trigger <code>POST /api/marketing/tests</code> from “Send Test” to validate payloads.',
          worker: 'Connect a worker that consumes the queue and triggers Twilio/SendGrid with logs.'
        },
        curl: {
          heading: 'cURL Smoke Test',
          badge: 'Dev only',
          command: 'curl -X POST "$HOST/api/marketing/tests" \\\n+  -H "Authorization: Bearer $TOKEN" \\\n+  -H "Content-Type: application/json" \\\n+  -d \'{"channel":"sms","recipient":"+15125550199","smsPreview":"Hi {{first_name}}, your audit is ready."}\''
        },
        queue: {
          heading: 'Queued Test Sends',
          refresh: 'Refresh',
          empty: 'Run “Send Test” to see items here.'
        },
        providers: {
          heading: 'Provider Status',
          badge: 'Live sync',
          empty: 'Use the API to register Twilio/SendGrid credentials.'
        }
      },
      testModal: {
        title: 'Send Test Message',
        subtitle: 'Simulate a Twilio/SendGrid call. No live sends.',
        close: 'Close',
        channelLabel: 'Channel',
        channelOptions: {
          sms: 'SMS',
          email: 'Email'
        },
        recipientLabel: 'Send To',
        recipientPlaceholder: '+1 512 555 0199 or demo@revolv.ai',
        notesLabel: 'Notes',
        notesPlaceholder: 'Log what you’re validating: tone, CTA, bilingual render.',
        footerHint: 'Preview payload is queued via the marketing API for QA.',
        queueButton: 'Queue Test',
        success: 'Queued via marketing API — list updates below.',
        errorPrefix: 'Error: {error}'
      },
      testQueue: {
        loading: 'Loading queue…',
        previewFallback: 'Preview ready for dispatch.',
        segmentLabel: 'Segment: {value}',
        charsLabel: '{count} chars',
        byLabel: 'By {name}',
        errorPrefix: 'API error: '
      },
      providers: {
        status: {
          ready: 'Ready',
          check: 'Check',
          pending: 'Pending'
        },
        noteFallback: 'Document compliance requirements.',
        envPrefix: 'Env: {value}',
        updatedPrefix: 'Updated {timestamp}',
        errorPrefix: 'Provider API error: '
      }
    },
    billing: {
      meta: { title: 'Billing' },
      noClient: 'Select a client from the Clients page first.',
      hero: {
        eyebrow: 'Cashflow clarity',
        title: 'Billing & Subscriptions',
        subtitle: 'Keep every charge traceable for Metro-2 and FCRA compliance while giving clients premium payment experiences.',
        body: 'Keep every charge traceable for Metro-2 and FCRA compliance while giving clients premium payment experiences.',
        bullets: {
          secureLinks: 'Send secure payment links within seconds.',
          trackChargeoffs: 'Track charge-offs vs. settlements cleanly.',
          remindClients: 'Auto-remind clients ahead of due dates.',
          snapshotKpis: 'Snapshot KPIs for finance + sales teams.'
        },
        card: {
          heading: 'Active invoices',
          target: 'Consult → Purchase target: 42%.',
          button: 'Send payment link',
          footnote: 'Share via SMS or email—no SSN stored, only last4 on file.'
        },
        buttons: {
          downloadCsv: 'Download CSV',
          offerPayoff: 'Offer one-time payoff'
        }
      },
      metrics: {
        planLabel: 'Plan',
        planValue: 'Growth Suite · $297/mo',
        planDescription: 'Includes Metro-2 automation, dispute letter engine, and bilingual support.',
        planCta: 'View upgrades',
        outstandingLabel: 'Outstanding',
        outstandingDescription: 'Balance awaiting payment.',
        nextDueLabel: 'Next due',
        nextDescriptionDefault: 'No open invoices.',
        nextDescriptionTemplate: 'Invoice: {description}',
        collectedLabel: 'Collected YTD',
        collectedDescription: 'Closed revenue booked this year.'
      },
      autopay: {
        heading: 'Autopay control',
        statusOn: 'Autopay on',
        statusOff: 'Autopay off',
        copyOn: 'We will process nightly drafts and email receipts automatically.',
        copyOff: 'Turn this on to draft recurring invoices and stay Metro-2 compliant.',
        toggleOn: 'Enable autopay',
        toggleOff: 'Pause autopay',
        receipts: 'Receipts email instantly.'
      },
      invoices: {
        heading: 'Invoice history',
        subheading: 'Monitor payments, disputes, and refunds.',
        badges: {
          dueSoon: 'Due soon',
          paid: 'Paid'
        },
        table: {
          description: 'Description',
          amount: 'Amount',
          due: 'Due',
          status: 'Status',
          actions: 'Actions'
        },
        empty: 'No invoices yet. Create your first invoice to trigger consult → purchase tracking.',
        compliance: 'Compliance note: never promise guaranteed credit outcomes or timelines. Set realistic expectations on every invoice.',
        status: {
          paid: 'Paid',
          unpaid: 'Unpaid'
        },
        actions: {
          pdf: 'PDF',
          markPaid: 'Mark paid'
        }
      },
      paymentMethod: {
        heading: 'Saved payment method',
        summary: 'Visa ending 4242 · Updated Jun 14',
        badge: 'Tokenized',
        message: 'Apple Pay & ACH ready. Use Stripe to refresh authorization.',
        button: 'Update card'
      },
      quickAdd: {
        heading: 'Quick add invoice',
        fields: {
          descriptionLabel: 'Description',
          descriptionPlaceholder: 'Metro-2 audit retainer',
          amountLabel: 'Amount',
          amountPlaceholder: '297.00',
          dueLabel: 'Due date'
        },
        button: 'Add invoice',
        footnote: 'We only store last4 + token.'
      },
      revenue: {
        heading: 'Revenue accelerator',
        copy: 'Bundle a Metro-2 compliance review for $97 and boost AOV.',
        button: 'Launch growth review',
        footnote: 'KPI to watch: AOV & Consult → Purchase%.'
      }
    },
    tiers: {
      names: {
        creditLegend: 'Credit Legend',
        creditHero: 'Credit Hero',
        creditChampion: 'Credit Champion',
        creditWarrior: 'Credit Warrior',
        creditSurgeon: 'Credit Surgeon',
        disputeMaster: 'Dispute Master',
        debtSlayer: 'Debt Slayer',
        reportScrubber: 'Report Scrubber',
        scoreShifter: 'Score Shifter',
        creditCleaner: 'Credit Cleaner',
        balanceBuster: 'Balance Buster',
        debtDuster: 'Debt Duster',
        rookie: 'Rookie'
      },
      messages: {
        creditLegend: 'The ultimate, rare achievement.',
        creditHero: 'You’re now the hero of your credit story.',
        creditChampion: 'Championing your credit victory.',
        creditWarrior: 'Battle-ready credit repair fighter.',
        creditSurgeon: 'Precision deletions.',
        disputeMaster: 'Mastering the dispute process.',
        debtSlayer: 'Slaying negative accounts.',
        reportScrubber: 'Deep cleaning your credit.',
        scoreShifter: 'Scores are improving.',
        creditCleaner: 'Your report is shining.',
        balanceBuster: 'Breaking negative balances.',
        debtDuster: 'Cleaning up the dust.',
        rookie: 'You’ve started your journey.'
      }
    }
  },
  es: {
    language: { name: 'Español', code: 'ES', switchTo: 'Cambiar a {language}' },
    brand: 'Metro 2 CRM',
    nav: {
      dashboard: 'Panel',
      clients: 'Clientes',
      leads: 'Prospectos',
      schedule: 'Agenda',
      billing: 'Facturación',
      marketing: 'Marketing',
      settings: 'Configuración',
      myCompany: 'Mi empresa',
      letters: 'Cartas',
      library: 'Biblioteca',
      workflows: 'Flujos',
      tradelines: 'Líneas de crédito'
    },
    buttons: {
      menu: 'Menú',
      help: 'Ayuda',
      helpTip: 'Ayuda (H)',
      invite: 'Agregar integrante',
      invitePlus: 'Invitar +',
      addTeamMember: 'Agregar integrante',
      logout: 'Cerrar sesión'
    },
    prompts: {
      teammateEmail: '¿Correo del integrante?',
      teammateName: '¿Nombre del integrante?',
      inviteFailed: 'No se pudo invitar al integrante'
    },
    badges: {
      tooltip: 'Has iniciado tu recorrido.'
    },
    marketing: {
      meta: { title: 'Marketing' },
      hero: {
        title: 'Lanzadera de Marketing',
        subtitle: 'Diseña recorridos premium de recuperación crediticia, nutre prospectos y prepara automatizaciones enfocadas en conversión antes de conectarlas con Twilio, SendGrid u otra integración.',
        tip: 'Tip: documenta cada punto de contacto bilingüe (EN/ES) para mantener el cumplimiento, aumentar la confianza y preparar upsells. Cuando los ganchos del backend estén listos, estas tarjetas podrán enviar cargas directo a tu cola de automatización.'
      },
      smsBuilder: {
        heading: 'Constructor de Campañas SMS',
        description: 'Diseña alcance conforme a normativas, personaliza con campos dinámicos y visualiza la experiencia móvil antes de lanzar.',
        kpi: 'KPI sugerido: Tasa de respuesta',
        upsell: 'Upsell: Seguimiento Concierge por SMS',
        experiment: 'Prueba A/B: “Agendar llamada” vs “Descubre tu plan”',
        campaignName: 'Nombre de la campaña',
        campaignPlaceholder: 'Lanzamiento Promoción Otoño',
        recipientLabel: 'Grupo de destinatarios',
        recipients: {
          leads: 'Todos los leads',
          newClients: 'Clientes nuevos (≤30 días)',
          inactive: 'Cuentas inactivas (90+ días)',
          truckers: 'Propietarios-operadores / Camioneros'
        },
        messageLabel: 'Mensaje',
        messagePlaceholder: 'Hola {{first_name}}, detectamos una actualización de disputa lista para revisión. Toca para confirmar tu próximo paso.',
        insertMerge: 'Insertar campo dinámico',
        personalize: '+ Personalizar',
        characterLabel: 'Conteo de caracteres:',
        guardrails: 'Controles: la copia de opt-out se agrega automáticamente y se limita la tasa cuando esté en producción.',
        previewButton: 'Previsualizar SMS',
        sendTestButton: 'Enviar prueba',
        previewBadge: 'Previsualización • Lista para Twilio',
        previewNote: 'La personalización usa datos demo. El envío final usará campos en vivo del CRM.'
      },
      emailBuilder: {
        heading: 'Diseñador de Plantillas de Email',
        description: 'Organiza flujos de nutrición, automatiza onboarding bilingüe y prepara envíos con marca antes de conectarlos a SendGrid o Postalytics.',
        metricChip: 'Métrica: Apertura → Consultas %',
        automationChip: 'Idea de automatización: goteo de 7 días',
        experimentChip: 'Prueba CTA: “Agendar sesión estratégica” vs “Explora tu plan”',
        newTemplate: 'Nueva plantilla',
        importHtml: 'Importar HTML',
        filterLabel: 'Segmento',
        filters: {
          all: 'Todos los segmentos',
          b2c: 'Consumidores B2C',
          b2b: 'B2B / Camioneros',
          attorneys: 'Abogados / Referidos'
        },
        filterHelper: 'Filtra para preparar automatizaciones a medida.',
        emptyState: 'Las plantillas se cargan desde el backend. Usa “Nueva plantilla” para guardar tu primer diseño.',
        loading: 'Cargando plantillas desde la API…',
        errorPrefix: 'Error de API: ',
        template: {
          badgeFallback: 'Personalizada',
          draftLabel: 'Borrador',
          editButton: 'Editar',
          editAlert: 'Conecta tu editor de plantillas a {title}. Usa /api/marketing/templates para guardar cambios.'
        },
        prompts: {
          name: '¿Nombre de la plantilla?',
          purpose: '¿Cuál es el objetivo?',
          descriptionFallback: 'Define los toques de nutrición y el CTA.',
          error: 'No se pudo guardar la plantilla: {error}',
          importReminder: 'Envía tu HTML a /api/marketing/templates con { html } cuando tu pipeline de CSS inline esté listo.'
        }
      },
      campaignDashboard: {
        heading: 'Vista previa del panel de campañas',
        description: 'Marcadores listos para mostrar métricas de Twilio/SendGrid, ingresos de pipeline y alertas de cumplimiento.',
        recentCampaigns: 'Campañas recientes',
        exportCsv: 'Exportar CSV',
        statuses: {
          scheduled: 'Programada',
          completed: 'Completada',
          draft: 'Borrador'
        },
        cards: {
          newYear: {
            title: 'Impulso de Año Nuevo',
            body: 'Próximo toque: 3 de enero • Segmento: Cuentas inactivas • Objetivo KPI: 18% tasa de consulta.'
          },
          trucker: {
            title: 'Webinar Seguridad + Crédito para Camioneros',
            body: 'Resultado: 24 consultas agendadas • Upsell: Retainer de cumplimiento para flotas.'
          },
          scoreDrop: {
            title: 'Alerta de baja de puntaje',
            body: 'Conecta el webhook al detector de anomalías Metro-2 • CTA: Agenda estrategia de disputa.'
          }
        },
        metrics: {
          heading: 'Marcador de métricas',
          badge: 'API lista',
          placeholder: '<span>Coloca chart.js o Recharts aquí.</span><span>Mapea aperturas %, clics %, ingresos por envío.</span>',
          bullets: {
            track: '• Rastrea: Apertura → Consulta %, Consulta → Pago %, Reembolsos %',
            alerts: '• Alertas: picos de opt-out, caídas de entregabilidad',
            next: '• Próximo: webhook a Slack para campañas en riesgo'
          }
        },
        experiments: {
          heading: 'Cola de experimentos',
          item1: '1️⃣ Ancla de precio: “Sesión estratégica $49” vs “Descubrimiento $0”',
          item2: '2️⃣ Microcopy de CTA: “Inicia auditoría” vs “Comienza tu auditoría”',
          item3: '3️⃣ Ubicación de prueba social: testimonios vs visualizador de puntajes',
          logButton: 'Registrar hipótesis',
          prompt: 'Registra tu hipótesis de experimento',
          customPrefix: '{index}️⃣ {idea}'
        }
      },
      integration: {
        heading: 'Lista de integración',
        description: 'Conecta esta UI a Twilio, SendGrid y otros servicios sin perder cumplimiento.',
        stepsTitle: 'Pasos para activar',
        steps: {
          collect: 'Recopila llaves API y SIDs; guárdalos en <code>.env</code> o en Configuración → Integraciones.',
          providers: 'Llama a <code>PATCH /api/marketing/providers/:id</code> para marcar proveedores como <span class="font-semibold">listos</span>.',
          tests: 'Dispara <code>POST /api/marketing/tests</code> desde “Enviar prueba” para validar cargas.',
          worker: 'Conecta un worker que consuma la cola y dispare Twilio/SendGrid con logs.'
        },
        curl: {
          heading: 'Prueba cURL',
          badge: 'Solo dev',
          command: 'curl -X POST "$HOST/api/marketing/tests" \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"channel":"sms","recipient":"+15125550199","smsPreview":"Hola {{first_name}}, tu auditoría está lista."}\''
        },
        queue: {
          heading: 'Pruebas en cola',
          refresh: 'Actualizar',
          empty: 'Ejecuta “Enviar prueba” para ver elementos aquí.'
        },
        providers: {
          heading: 'Estado de proveedores',
          badge: 'Sincronización en vivo',
          empty: 'Usa la API para registrar credenciales de Twilio/SendGrid.'
        }
      },
      testModal: {
        title: 'Enviar mensaje de prueba',
        subtitle: 'Simula una llamada Twilio/SendGrid. Sin envíos reales.',
        close: 'Cerrar',
        channelLabel: 'Canal',
        channelOptions: {
          sms: 'SMS',
          email: 'Email'
        },
        recipientLabel: 'Enviar a',
        recipientPlaceholder: '+1 512 555 0199 o demo@revolv.ai',
        notesLabel: 'Notas',
        notesPlaceholder: 'Registra lo que validas: tono, CTA, render bilingüe.',
        footerHint: 'La carga de prueba se envía a la API de marketing para QA.',
        queueButton: 'Poner en cola',
        success: 'Encolado vía API de marketing — revisa la lista abajo.',
        errorPrefix: 'Error: {error}'
      },
      testQueue: {
        loading: 'Cargando cola…',
        previewFallback: 'Previsualización lista para enviar.',
        segmentLabel: 'Segmento: {value}',
        charsLabel: '{count} caracteres',
        byLabel: 'Por {name}',
        errorPrefix: 'Error de API: '
      },
      providers: {
        status: {
          ready: 'Listo',
          check: 'Revisar',
          pending: 'Pendiente'
        },
        noteFallback: 'Documenta requisitos de cumplimiento.',
        envPrefix: 'Entorno: {value}',
        updatedPrefix: 'Actualizado {timestamp}',
        errorPrefix: 'Error de API de proveedores: '
      }
    },
    billing: {
      meta: { title: 'Facturación' },
      noClient: 'Selecciona un cliente en la página de Clientes primero.',
      hero: {
        eyebrow: 'Claridad financiera',
        title: 'Facturación y Suscripciones',
        subtitle: 'Mantén cada cargo trazable para el cumplimiento Metro-2 y FCRA mientras ofreces experiencias de pago premium.',
        body: 'Mantén cada cargo trazable para el cumplimiento Metro-2 y FCRA mientras ofreces experiencias de pago premium.',
        bullets: {
          secureLinks: 'Envía enlaces de pago seguros en segundos.',
          trackChargeoffs: 'Sigue cargos vs. acuerdos con claridad.',
          remindClients: 'Automatiza recordatorios antes de la fecha límite.',
          snapshotKpis: 'Visibiliza KPIs para finanzas y ventas.'
        },
        card: {
          heading: 'Facturas activas',
          target: 'Objetivo Consultoría → Compra: 42%.',
          button: 'Enviar enlace de pago',
          footnote: 'Comparte por SMS o email; jamás almacenamos el SSN completo.'
        },
        buttons: {
          downloadCsv: 'Descargar CSV',
          offerPayoff: 'Ofrecer pago único'
        }
      },
      metrics: {
        planLabel: 'Plan',
        planValue: 'Growth Suite · $297/mes',
        planDescription: 'Incluye automatización Metro-2, motor de cartas de disputa y soporte bilingüe.',
        planCta: 'Ver mejoras',
        outstandingLabel: 'Pendiente',
        outstandingDescription: 'Saldo pendiente de cobro.',
        nextDueLabel: 'Próximo vencimiento',
        nextDescriptionDefault: 'No hay facturas abiertas.',
        nextDescriptionTemplate: 'Factura: {description}',
        collectedLabel: 'Cobrado en el año',
        collectedDescription: 'Ingresos cerrados este año.'
      },
      autopay: {
        heading: 'Cargo automático',
        statusOn: 'Cargo automático activado',
        statusOff: 'Cargo automático desactivado',
        copyOn: 'Procesaremos cargos nocturnos y enviaremos recibos automáticamente.',
        copyOff: 'Activa esta opción para automatizar facturas recurrentes con cumplimiento Metro-2.',
        toggleOn: 'Activar cargo automático',
        toggleOff: 'Pausar cargo automático',
        receipts: 'Los recibos se envían por email al instante.'
      },
      invoices: {
        heading: 'Historial de facturas',
        subheading: 'Supervisa pagos, disputas y reembolsos.',
        badges: {
          dueSoon: 'Vence pronto',
          paid: 'Pagado'
        },
        table: {
          description: 'Descripción',
          amount: 'Monto',
          due: 'Vence',
          status: 'Estado',
          actions: 'Acciones'
        },
        empty: 'Aún no hay facturas. Crea la primera factura para activar el seguimiento de consultoría → compra.',
        compliance: 'Nota de cumplimiento: nunca prometas resultados crediticios garantizados ni plazos específicos. Establece expectativas realistas en cada factura.',
        status: {
          paid: 'Pagado',
          unpaid: 'Pendiente'
        },
        actions: {
          pdf: 'PDF',
          markPaid: 'Marcar pagado'
        }
      },
      paymentMethod: {
        heading: 'Método de pago guardado',
        summary: 'Visa terminación 4242 · Actualizada 14 Jun',
        badge: 'Tokenizado',
        message: 'Apple Pay y ACH listos. Usa Stripe para refrescar la autorización.',
        button: 'Actualizar tarjeta'
      },
      quickAdd: {
        heading: 'Crear factura rápida',
        fields: {
          descriptionLabel: 'Descripción',
          descriptionPlaceholder: 'Retainer de auditoría Metro-2',
          amountLabel: 'Monto',
          amountPlaceholder: '297.00',
          dueLabel: 'Fecha límite'
        },
        button: 'Crear factura',
        footnote: 'Solo almacenamos últimos 4 dígitos y token de pago.'
      },
      revenue: {
        heading: 'Acelerador de ingresos',
        copy: 'Agrupa una revisión de cumplimiento Metro-2 por $97 y aumenta el ticket promedio.',
        button: 'Lanzar revisión de crecimiento',
        footnote: 'Mide Ticket Promedio y % Consulta → Compra.'
      }
    },
    tiers: {
      names: {
        creditLegend: 'Leyenda del Crédito',
        creditHero: 'Héroe del Crédito',
        creditChampion: 'Campeón del Crédito',
        creditWarrior: 'Guerrero del Crédito',
        creditSurgeon: 'Cirujano del Crédito',
        disputeMaster: 'Maestro de Disputas',
        debtSlayer: 'Destructor de Deudas',
        reportScrubber: 'Limpiador del Reporte',
        scoreShifter: 'Impulsor de Puntajes',
        creditCleaner: 'Limpiador de Crédito',
        balanceBuster: 'Rompe Saldos',
        debtDuster: 'Sacudidor de Deudas',
        rookie: 'Novato'
      },
      messages: {
        creditLegend: 'El logro más alto y raro.',
        creditHero: 'Ahora eres el héroe de tu historia crediticia.',
        creditChampion: 'Celebrando tu victoria crediticia.',
        creditWarrior: 'Listo para pelear disputas.',
        creditSurgeon: 'Eliminaciones de precisión.',
        disputeMaster: 'Dominando el proceso de disputas.',
        debtSlayer: 'Eliminando cuentas negativas.',
        reportScrubber: 'Limpiando a fondo tu reporte.',
        scoreShifter: 'Los puntajes van mejorando.',
        creditCleaner: 'Tu reporte está brillando.',
        balanceBuster: 'Rompiendo saldos negativos.',
        debtDuster: 'Sacudiendo la deuda restante.',
        rookie: 'Has iniciado tu recorrido.'
      }
    }
  }
};

function getStoredLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && TRANSLATIONS[stored]) return stored;
  } catch (err) {
    console.debug('language storage read failed', err);
  }
  return DEFAULT_LANGUAGE;
}

export function getTranslation(key, lang = currentLanguage) {
  if (!key) return '';
  const dictionary = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANGUAGE];
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dictionary) ?? '';
}

let currentLanguage = typeof window === 'undefined' ? DEFAULT_LANGUAGE : getStoredLanguage();
if (typeof document !== 'undefined') {
  document.documentElement?.setAttribute('lang', currentLanguage);
}

function updateInviteButtonCopy(btn, variant, lang = currentLanguage) {
  if (!btn) return;
  const key = variant === 'invite_plus' ? 'buttons.invitePlus' : 'buttons.addTeamMember';
  const label = getTranslation(key, lang) || getTranslation('buttons.invite', lang);
  if (label) btn.textContent = label;
}


function applyDataI18n(lang = currentLanguage) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const value = getTranslation(key, lang);
    if (!value) return;
    el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.dataset.i18nHtml;
    const value = getTranslation(key, lang);
    if (!value) return;
    el.innerHTML = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    const value = getTranslation(key, lang);
    if (!value) return;
    if ('placeholder' in el) {
      el.placeholder = value;
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle;
    const value = getTranslation(key, lang);
    if (!value) return;
    el.title = value;
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    const value = getTranslation(key, lang);
    if (!value) return;
    el.setAttribute('aria-label', value);
  });
}

function updateLanguageToggleControl() {
  if (typeof document === 'undefined') return;
  const toggle = document.getElementById('languageToggle');
  if (!toggle) return;
  const nextLanguage = currentLanguage === 'en' ? 'es' : 'en';
  const currentConfig = TRANSLATIONS[currentLanguage];
  const nextConfig = TRANSLATIONS[nextLanguage];
  if (nextConfig?.language?.code) {
    toggle.textContent = nextConfig.language.code;
  }
  if (currentConfig?.language?.switchTo && nextConfig?.language?.name) {
    const label = currentConfig.language.switchTo.replace('{language}', nextConfig.language.name);
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
  }
  toggle.dataset.language = currentLanguage;
}

export function applyLanguage(lang = currentLanguage) {
  const target = TRANSLATIONS[lang] ? lang : DEFAULT_LANGUAGE;
  currentLanguage = target;

  if (typeof document !== 'undefined') {
    document.documentElement?.setAttribute('lang', target);
  }

  const mapping = [
    ['.nav-brand-row .text-xl', 'brand'],
    ['a[href="/dashboard"]', 'nav.dashboard'],
    ['a[href="/clients"]', 'nav.clients'],
    ['a[href="/leads"]', 'nav.leads'],
    ['a[href="/schedule"]', 'nav.schedule'],
    ['a[href="/billing"]', 'nav.billing'],
    ['a[href="/marketing"]', 'nav.marketing'],
    ['a[href="/tradelines"]', 'nav.tradelines'],
    ['#navCompany', 'nav.myCompany'],
    ['#navSettingsMenu a[href="/letters"]', 'nav.letters'],
    ['#navSettingsMenu a[href="/library"]', 'nav.library'],
    ['#navSettingsMenu a[href="/workflows"]', 'nav.workflows']
  ];
  if (typeof document !== 'undefined') {
    mapping.forEach(([selector, key]) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const value = getTranslation(key, target);
      if (value) el.textContent = value;
    });
  }

  if (typeof document !== 'undefined') {
    const navToggle = document.getElementById('navToggle');
    const menuLabel = getTranslation('buttons.menu', target);
    if (navToggle && menuLabel) {
      navToggle.setAttribute('aria-label', menuLabel);
      const span = navToggle.querySelector('span');
      if (span) span.textContent = menuLabel;
    }

    const settingsToggleLabel = document.querySelector('#navSettingsToggle span');
    const settingsLabel = getTranslation('nav.settings', target);
    if (settingsToggleLabel && settingsLabel) settingsToggleLabel.textContent = settingsLabel;
    const settingsToggle = document.getElementById('navSettingsToggle');
    if (settingsToggle && settingsLabel) settingsToggle.setAttribute('aria-label', settingsLabel);

    const helpButton = document.getElementById('btnHelp');
    if (helpButton) {
      const helpLabel = getTranslation('buttons.help', target);
      if (helpLabel) helpButton.textContent = helpLabel;
      const tip = getTranslation('buttons.helpTip', target);
      if (tip) helpButton.setAttribute('data-tip', tip);
    }

    const inviteButton = document.getElementById('btnInvite');
    if (inviteButton) {
      const variant = inviteButton.dataset.ctaVariant || localStorage.getItem('cta_variant') || 'add_team_member';
      updateInviteButtonCopy(inviteButton, variant, target);
    }

    const logoutButton = document.getElementById('btnLogout');
    if (logoutButton) {
      const logoutLabel = getTranslation('buttons.logout', target);
      if (logoutLabel) logoutButton.textContent = logoutLabel;
    }

    const tierBadge = document.getElementById('tierBadge');
    if (tierBadge) {
      const tooltip = getTranslation('tiers.messages.rookie', target) || getTranslation('badges.tooltip', target);
      if (tooltip) tierBadge.title = tooltip;
    }
  }

  applyDataI18n(target);
  updateLanguageToggleControl();
  if (typeof renderDeletionTier === 'function') {
    renderDeletionTier();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm:language-change', { detail: { language: target } }));
  }
}

export function setLanguage(lang) {
  const target = TRANSLATIONS[lang] ? lang : DEFAULT_LANGUAGE;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, target);
  } catch (err) {
    console.debug('language storage write failed', err);
  }
  applyLanguage(target);
}

export function getCurrentLanguage() {
  return currentLanguage;
}

function initLanguageToggle() {
  if (typeof document === 'undefined') return;
  const navRow = document.querySelector('.nav-brand-row');
  if (!navRow || document.getElementById('languageToggle')) return;
  const navToggle = document.getElementById('navToggle');
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'languageToggle';
  button.className = 'btn nav-btn md:ml-2';
  button.addEventListener('click', () => {
    const next = currentLanguage === 'en' ? 'es' : 'en';
    setLanguage(next);
    trackEvent('language_toggle', { language: next });
  });
  if (navToggle) {
    navRow.insertBefore(button, navToggle);
  } else {
    navRow.appendChild(button);
  }
  updateLanguageToggleControl();
}


function initResponsiveNav() {
  const nav = document.getElementById('primaryNav');
  const toggle = document.getElementById('navToggle');
  const settings = document.getElementById('navSettings');
  const settingsToggle = document.getElementById('navSettingsToggle');

  if (!nav || !toggle) return;

  const closeSettings = () => {
    if (settings) settings.classList.remove('open');
    settingsToggle?.setAttribute('aria-expanded', 'false');
  };

  const updateLayout = () => {
    const navRoleHidden = nav.dataset.roleHidden === 'true';
    const toggleRoleHidden = toggle.dataset.roleHidden === 'true';
    const isDesktop = window.innerWidth >= 768;

    if (isDesktop) {
      toggle.classList.add('hidden');

      if (navRoleHidden) {
        nav.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        nav.classList.remove('hidden');
        toggle.setAttribute('aria-expanded', 'true');
      }

      return;
    }

    toggle.classList.toggle('hidden', toggleRoleHidden);

    if (navRoleHidden) {
      nav.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
      return;
    }

    const hidden = nav.classList.contains('hidden');
    toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  };

  toggle.addEventListener('click', () => {
    const nowHidden = nav.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
    if (nowHidden) closeSettings();
  });

  settingsToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = settings?.classList.toggle('open');
    settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!settings) return;
    if (!settings.contains(e.target)) {
      closeSettings();
    }
  });

  window.addEventListener('resize', updateLayout);
  updateLayout();
}

document.addEventListener('DOMContentLoaded', () => {
  initResponsiveNav();
  trackEvent('page_view', { path: location.pathname });
  initAbTest();
  initLanguageToggle();
  applyLanguage(currentLanguage);
  const btnInvite = document.getElementById('btnInvite');
  if (btnInvite) {
    btnInvite.addEventListener('click', async () => {
      const emailPrompt = getTranslation('prompts.teammateEmail') || 'Teammate email?';
      const email = prompt(emailPrompt);
      if (!email) return;
      const namePrompt = getTranslation('prompts.teammateName') || 'Teammate name?';
      const name = prompt(namePrompt);
      if (!name) return;
      try {
        const res = await fetch('/api/team-members', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader()
          },
          body: JSON.stringify({ username: email, name })
        });
        const data = await res.json();
        if (!res.ok || !data.member) throw new Error(data.error || 'Request failed');
        alert(`Token: ${data.member.token}\nTemp Password: ${data.member.password}`);
        const team = JSON.parse(localStorage.getItem('teamMembers') || '[]');
        team.push({ name, email, role: 'team' });
        localStorage.setItem('teamMembers', JSON.stringify(team));
      } catch (err) {
        alert(getTranslation('prompts.inviteFailed') || 'Failed to invite member');
      }
    });
  }
  applyRoleNav(window.userRole);
});

function initAbTest() {
  const btn = document.getElementById('btnInvite');
  if (!btn) return;
  let variant = localStorage.getItem('cta_variant');
  if (!variant) {
    variant = Math.random() < 0.5 ? 'invite_plus' : 'add_team_member';
    localStorage.setItem('cta_variant', variant);
  }
  btn.dataset.ctaVariant = variant;
  updateInviteButtonCopy(btn, variant);
  trackEvent('ab_exposure', { experiment: 'cta_copy', variant });
}

// Allow ?auth=BASE64 or ?token=JWT links to set local auth state
// (runs early so tokens in query strings are captured immediately)
//
const params = new URLSearchParams(location.search);
const _authParam = params.get('auth');
if (_authParam) {
  localStorage.setItem('auth', _authParam);
}
const _tokenParam = params.get('token');
if (_tokenParam) {
  localStorage.setItem('token', _tokenParam);
}

// redirect to login if not authenticated
if (location.pathname !== '/' && location.pathname !== '/login.html') {
  const hasAuth = localStorage.getItem('token') || localStorage.getItem('auth');
  if (!hasAuth) location.href = '/login.html';
}

function parseJwt(t){
  try{
    return JSON.parse(atob(t.split('.')[1]));
  }catch{return {};}
}

const _tok = localStorage.getItem('token');
const _payload = _tok ? parseJwt(_tok) : {};
window.userRole = _payload.role || null;

function restrictRoutes(role){
  const allowed = {
    host: null,
    team: ['/dashboard','/clients','/leads','/marketing','/schedule','/billing','/','/index.html','/login.html','/team-member-template.html'],
    client: ['/client-portal','/portal','/login.html','/']
  }[role];
  if(!allowed) return;
  const path = location.pathname;
  const ok = allowed.some(p=> path.startsWith(p));
  if(!ok){
    location.href = role === 'client' ? '/client-portal-template.html' : '/dashboard';
  }
}
restrictRoutes(window.userRole);

// append a logout button to the nav if present
const navContainer = document.getElementById('primaryNavLinks');
if (navContainer) {
  if (!navContainer.querySelector('a[href="/marketing"]')) {
    const marketingLink = document.createElement('a');
    marketingLink.href = '/marketing';
    marketingLink.className = 'btn nav-btn';
    marketingLink.textContent = getTranslation('nav.marketing');
    const scheduleLink = navContainer.querySelector('a[href="/schedule"]');
    if (scheduleLink?.parentElement === navContainer) {
      navContainer.insertBefore(marketingLink, scheduleLink);
    } else {
      const leadsLink = navContainer.querySelector('a[href="/leads"]');
      leadsLink?.insertAdjacentElement('afterend', marketingLink);
      if (!leadsLink) navContainer.appendChild(marketingLink);
    }
  }
  const btnLogout = document.createElement('button');
  btnLogout.id = 'btnLogout';
  btnLogout.className = 'btn nav-btn';
  btnLogout.textContent = getTranslation('buttons.logout');
  btnLogout.addEventListener('click', () => {
    // clear all locally stored state when logging out to avoid
    // carrying data between different user sessions
    localStorage.clear();

    location.href = '/login.html';
  });
  navContainer.appendChild(btnLogout);
}

function applyRoleNav(role){
  const nav = document.getElementById('primaryNav');
  const navLinks = document.getElementById('primaryNavLinks');
  const toggle = document.getElementById('navToggle');
  if(!nav || !navLinks) return;
  if(nav.dataset.roleHidden === 'true'){
    nav.classList.remove('hidden');
  }
  nav.style.removeProperty('display');
  nav.removeAttribute('aria-hidden');
  delete nav.dataset.roleHidden;
  if(toggle){
    if(toggle.dataset.roleHidden === 'true'){
      toggle.classList.remove('hidden');
    }
    toggle.style.removeProperty('display');
    toggle.removeAttribute('aria-hidden');
    delete toggle.dataset.roleHidden;
  }
  if(role === 'client'){
    if(!nav.classList.contains('hidden')){
      nav.dataset.roleHidden = 'true';
    }
    nav.classList.add('hidden');
    nav.setAttribute('aria-hidden','true');
    if(toggle){
      if(!toggle.classList.contains('hidden')){
        toggle.dataset.roleHidden = 'true';
      }
      toggle.classList.add('hidden');
      toggle.setAttribute('aria-hidden','true');
    }
    return;
  }
  if(role === 'team'){
    const allowed = new Set(['/dashboard','/clients','/leads','/marketing','/schedule','/billing']);
    navLinks.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if(href && !allowed.has(href)){
        link.remove();
      }
    });
    ['btnInvite','btnHelp','tierBadge'].forEach(id => {
      const el = navLinks.querySelector(`#${id}`);
      if(el) el.remove();
    });
  }
}
const THEMES = {
  blue:   { accent: '#007AFF', hover: '#005bb5', bg: 'rgba(0,122,255,0.12)', glassBg: 'rgba(0,122,255,0.15)', glassBrd: 'rgba(0,122,255,0.3)' },
  green:  { accent: '#34C759', hover: '#248a3d', bg: 'rgba(52,199,89,0.12)', glassBg: 'rgba(52,199,89,0.15)', glassBrd: 'rgba(52,199,89,0.3)' },
  orange: { accent: '#FF9500', hover: '#cc7600', bg: 'rgba(255,149,0,0.12)', glassBg: 'rgba(255,149,0,0.15)', glassBrd: 'rgba(255,149,0,0.3)' },
  red:    { accent: '#FF3B30', hover: '#c82d24', bg: 'rgba(255,59,48,0.12)', glassBg: 'rgba(255,59,48,0.15)', glassBrd: 'rgba(255,59,48,0.3)' },
  purple: { accent: '#AF52DE', hover: '#893dba', bg: 'rgba(175,82,222,0.12)', glassBg: 'rgba(175,82,222,0.15)', glassBrd: 'rgba(175,82,222,0.3)' },
  teal:   { accent: '#14B8A6', hover: '#0d9488', bg: 'rgba(20,184,166,0.12)', glassBg: 'rgba(20,184,166,0.15)', glassBrd: 'rgba(20,184,166,0.3)' },
  pink:   { accent: '#EC4899', hover: '#c0347a', bg: 'rgba(236,72,153,0.12)', glassBg: 'rgba(236,72,153,0.15)', glassBrd: 'rgba(236,72,153,0.3)' },
  spacegray: { accent: '#1C1C1E', hover: '#0d0d0d', bg: 'rgba(28,28,30,0.12)', glassBg: 'rgba(28,28,30,0.15)', glassBrd: 'rgba(28,28,30,0.3)' },
  metallicgrey: { accent: '#9FA2A4', hover: '#7e8082', bg: 'rgba(159,162,164,0.12)', glassBg: 'rgba(159,162,164,0.15)', glassBrd: 'rgba(159,162,164,0.3)' },
  glass: { accent: 'rgba(255,255,255,0.7)', hover: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.12)', glassBg: 'rgba(255,255,255,0.25)', glassBrd: 'rgba(255,255,255,0.4)', btnText: '#000' }

};

function applyTheme(name){
  const t = THEMES[name] || THEMES.purple;
  const root = document.documentElement.style;
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-hover', t.hover);
  root.setProperty('--accent-bg', t.bg);
  root.setProperty('--glass-bg', t.glassBg);
  root.setProperty('--glass-brd', t.glassBrd);
  root.setProperty('--btn-text', t.btnText || '#fff');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.accent);
  localStorage.setItem('theme', name);

  const slider = document.getElementById('glassAlpha');
  const match = t.glassBg.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/);
  const themeAlpha = match ? parseFloat(match[1]) : 0.15;
  const savedAlpha = parseFloat(localStorage.getItem('glassAlpha'));
  const alpha = isNaN(savedAlpha) ? themeAlpha : savedAlpha;
  if (slider) slider.value = alpha;
  setGlassAlpha(alpha);
}

function setGlassAlpha(alpha){
  const root = document.documentElement;
  const bg = getComputedStyle(root).getPropertyValue('--glass-bg').trim();
  const brd = getComputedStyle(root).getPropertyValue('--glass-brd').trim();
  const bgMatch = bg.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  const brdMatch = brd.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if(!bgMatch || !brdMatch) return;
  const ratio = parseFloat(brdMatch[4]) / parseFloat(bgMatch[4] || 1);
  root.style.setProperty('--glass-bg', `rgba(${bgMatch[1]},${bgMatch[2]},${bgMatch[3]},${alpha})`);
  root.style.setProperty('--glass-brd', `rgba(${brdMatch[1]},${brdMatch[2]},${brdMatch[3]},${alpha * ratio})`);
}

function initPalette(){
  if(document.getElementById('themePalette')) return;
  const wrap = document.createElement('div');
  wrap.id = 'themePalette';
  wrap.className = 'palette collapsed';
  const bubbles = Object.entries(THEMES)
    .map(([name, t]) => `<div class="bubble" data-theme="${name}" style="background:${t.accent}"></div>`)
    .join('');
  wrap.innerHTML = `
    <button class="toggle">◀</button>
    <div class="palette-controls">
      <input id="glassAlpha" class="alpha-slider" type="range" min="0" max="0.5" step="0.05" />
      <div class="palette-bubbles">${bubbles}</div>
    </div>
    <button id="voiceMic" class="mic">🎤</button>`;
  document.body.appendChild(wrap);
  const toggle = wrap.querySelector('.toggle');
  toggle.addEventListener('click', ()=>{
    wrap.classList.toggle('collapsed');
    toggle.textContent = wrap.classList.contains('collapsed') ? '◀' : '▶';
  });
  wrap.addEventListener('click', (e)=>{
    const b = e.target.closest('.bubble');
    if(!b) return;
    applyTheme(b.dataset.theme);
  });
  const saved = localStorage.getItem('theme') || 'purple';
  applyTheme(saved);
  const slider = wrap.querySelector('#glassAlpha');
  if(slider){
    slider.addEventListener('input', e=>{
      const v = parseFloat(e.target.value);
      setGlassAlpha(v);
      localStorage.setItem('glassAlpha', v);
    });
  }
}

export function authHeader(){
  const token = localStorage.getItem('token');
  if(token) return { Authorization: 'Bearer '+token };
  const auth = localStorage.getItem('auth');
  if(auth) return { Authorization: 'Basic '+auth };
  return {};
}

export async function api(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeader(),
    ...(options.headers || {})
  };
  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        return { status: res.status, ...parsed };
      }
      return { status: res.status, data: parsed };
    } catch {
      return { status: res.status, ok: res.ok, data: text };
    }
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

async function limitNavForMembers(){
  const headers = authHeader();
  if(Object.keys(headers).length === 0) return;
  try{
    const res = await fetch('/api/me',{ headers });
    if(!res.ok) return;
    const data = await res.json();
    const role = (data.user?.role || '').toLowerCase();
    if(!role.includes('member')) return;
    const nav = document.getElementById('primaryNavLinks');
    if(!nav) return;
    const allowed = new Set(['/dashboard','/schedule','/leads','/marketing','/billing','/clients']);
    [...nav.children].forEach(el=>{
      if(el.tagName === 'A'){
        const href = el.getAttribute('href');
        if(allowed.has(href)) return;
        el.remove();
      } else if(el.id === 'btnHelp' || el.id === 'btnInvite' || el.id === 'tierBadge'){
        el.remove();
      }
    });
  }catch{}
}

const deletionTiers = [
  { threshold: 150, key: 'creditLegend', name: 'Credit Legend', icon: '👑', class: 'bg-gradient-to-r from-purple-400 to-pink-500 text-white', message: 'The ultimate, rare achievement.' },
  { threshold: 125, key: 'creditHero', name: 'Credit Hero', icon: '🦸', class: 'bg-red-100 text-red-700', message: 'You’re now the hero of your credit story.' },
  { threshold: 100, key: 'creditChampion', name: 'Credit Champion', icon: '🏆', class: 'bg-yellow-200 text-yellow-800', message: 'Championing your credit victory.' },
  { threshold: 75, key: 'creditWarrior', name: 'Credit Warrior', icon: '🛡️', class: 'bg-indigo-100 text-indigo-700', message: 'Battle-ready credit repair fighter.' },
  { threshold: 60, key: 'creditSurgeon', name: 'Credit Surgeon', icon: '🩺', class: 'bg-cyan-100 text-cyan-700', message: 'Precision deletions.' },
  { threshold: 50, key: 'disputeMaster', name: 'Dispute Master', icon: '🥋', class: 'bg-purple-100 text-purple-700', message: 'Mastering the dispute process.' },
  { threshold: 40, key: 'debtSlayer', name: 'Debt Slayer', icon: '⚔️', class: 'bg-gray-100 text-gray-700', message: 'Slaying negative accounts.' },
  { threshold: 30, key: 'reportScrubber', name: 'Report Scrubber', icon: '🧼', class: 'bg-accent-subtle', message: 'Deep cleaning your credit.' },
  { threshold: 20, key: 'scoreShifter', name: 'Score Shifter', icon: '📊', class: 'bg-green-100 text-green-700', message: 'Scores are improving.' },
  { threshold: 15, key: 'creditCleaner', name: 'Credit Cleaner', icon: '🧽', class: 'bg-yellow-100 text-yellow-700', message: 'Your report is shining.' },
  { threshold: 10, key: 'balanceBuster', name: 'Balance Buster', icon: '💥', class: 'bg-orange-100 text-orange-700', message: 'Breaking negative balances.' },
  { threshold: 5, key: 'debtDuster', name: 'Debt Duster', icon: '🧹', class: 'bg-emerald-100 text-emerald-700', message: 'Cleaning up the dust.' },
  { threshold: 0, key: 'rookie', name: 'Rookie', icon: '📄', class: 'bg-emerald-100 text-emerald-700', message: 'You’ve started your journey.' },
];

function getDeletionTier(count){
  for(const tier of deletionTiers){
    if(count >= tier.threshold) return tier;
  }
  return deletionTiers[deletionTiers.length-1];
}

function ensureTierBadge(){
  if(document.getElementById('tierBadge')) return;
  const nav = document.getElementById('primaryNavLinks');
  if(!nav) return;
  const div = document.createElement('div');
  div.id = 'tierBadge';
  div.className = 'hidden sm:flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-emerald-700 shadow-sm animate-fadeInUp';
  const tooltip = getTranslation('tiers.messages.rookie') || getTranslation('badges.tooltip') || "You've started your journey.";
  const label = getTranslation('tiers.names.rookie') || 'Rookie';
  div.title = tooltip;
  div.innerHTML = `<span class="text-xl">📄</span><span class="font-semibold text-sm">${label}</span>`;
  nav.appendChild(div);
}

function renderDeletionTier(){
  const el = document.getElementById('tierBadge');
  if(!el) return;
  const deletions = Number(localStorage.getItem('deletions') || 0);
  const tier = getDeletionTier(deletions);
  const label = getTranslation(`tiers.names.${tier.key}`) || tier.name;
  const message = getTranslation(`tiers.messages.${tier.key}`) || tier.message;
  el.className = `hidden sm:flex items-center gap-2 rounded-full px-4 py-2 shadow-sm animate-fadeInUp ${tier.class}`;
  el.innerHTML = `<span class="text-xl">${tier.icon}</span><span class="font-semibold text-sm">${label}</span>`;
  el.title = message;
}

function ensureHelpModal(){
  if(document.getElementById('helpModal')) return;
  const div = document.createElement('div');
  div.id = 'helpModal';
  div.className = 'fixed inset-0 hidden items-center justify-center bg-[rgba(0,0,0,.45)] z-50';
  div.innerHTML = `
    <div class="glass card w-[min(720px,92vw)]">
      <div class="flex items-center justify-between mb-2">
        <div class="font-semibold">Hotkeys & Tips</div>
        <button id="helpClose" class="btn">×</button>
      </div>
      <div class="text-sm space-y-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="glass card p-2">
            <div class="font-medium mb-1">Global</div>
            <ul class="list-disc list-inside">
              <li><b>N</b> – New consumer</li>
              <li><b>U</b> – Upload HTML</li>
              <li><b>E</b> – Edit consumer</li>
              <li><b>G</b> – Generate letters</li>
              <li><b>C</b> – Clear (context-aware)</li>
              <li><b>H</b> – Help overlay</li>
              <li><b>R</b> – Remove focused tradeline card</li>
            </ul>
          </div>
          <div class="glass card p-2">
            <div class="font-medium mb-1">Modes / Cards</div>
            <ul class="list-disc list-inside">
              <li>Modes: <b>I</b>=Identity Theft, <b>D</b>=Data Breach, <b>S</b>=Sexual Assault</li>
              <li>Click a card to zoom; press <b>A</b> to toggle all bureaus on that card.</li>
              <li>Press <b>Esc</b> to exit a mode.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function openHelp(){
  ensureHelpModal();
  const modal = document.getElementById('helpModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  bindHelp();
}
function closeHelp(){
  const modal = document.getElementById('helpModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

function bindHelp(){
  document.getElementById('btnHelp')?.addEventListener('click', openHelp);
  document.getElementById('helpClose')?.addEventListener('click', closeHelp);
  document.getElementById('helpModal')?.addEventListener('click', (e)=>{ if(e.target.id==='helpModal') closeHelp(); });
}

window.selectedConsumerId = localStorage.getItem('selectedConsumerId') || null;

document.addEventListener('DOMContentLoaded', ()=>{
  ensureHelpModal();
  bindHelp();
  initPalette();
  initVoiceNotes();
  ensureTierBadge();
  renderDeletionTier();
  // limitNavForMembers(); // disabled during host/team nav debugging
});

window.openHelp = openHelp;

window.getSelectedConsumerId = function(){
  return window.selectedConsumerId;
};
window.setSelectedConsumerId = function(id){
  window.selectedConsumerId = id;
  if(id) localStorage.setItem('selectedConsumerId', id);
  else localStorage.removeItem('selectedConsumerId');
};


function initVoiceNotes(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition) return;
  if(document.getElementById('voiceOverlay')) return;
  const mic = document.getElementById('voiceMic');
  if(!mic) return;
  const overlay = document.createElement('div');
  overlay.id = 'voiceOverlay';
  document.body.appendChild(overlay);
  const notes = document.createElement('div');
  notes.id = 'voiceNotes';
  notes.className = 'glass card relative';
  notes.innerHTML = '<button class="close btn">×</button><textarea class="w-full h-full p-2"></textarea>';
  document.body.appendChild(notes);
  const textarea = notes.querySelector('textarea');
  const closeBtn = notes.querySelector('.close');
  let active = false;
  const keyword = (localStorage.getItem('voiceKeyword') || 'open notes').toLowerCase();
  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  function startRec(){
    try { rec.start(); } catch {}
  }
  function openNotes(){
    active = true;
    textarea.value = '';
    document.body.classList.add('voice-active');
    startRec();
  }
function closeNotes(){
    active = false;
    document.body.classList.remove('voice-active');
    try{ rec.stop(); }catch{}
  }
  rec.onresult = (e)=>{
    const txt = Array.from(e.results).map(r=>r[0].transcript).join('');
    if(!active){
      if(txt.toLowerCase().includes(keyword)) openNotes();
    } else {
      textarea.value = txt;
    }
  };
  rec.onend = startRec;
  mic.addEventListener('click', openNotes);
  closeBtn.addEventListener('click', ()=>{ closeNotes(); });
  startRec();
}

if (typeof window !== 'undefined') {
  Object.assign(window, { escapeHtml, formatCurrency, trackEvent, authHeader, api, setLanguage, getCurrentLanguage, applyLanguage, getTranslation });
}
