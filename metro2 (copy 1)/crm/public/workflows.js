const workflows = [
  {
    id: 'client-onboarding',
    icon: '🧭',
    segments: ['Client Success', 'Operations'],
    title: {
      en: 'Client Onboarding Workflow',
      es: 'Flujo de incorporación de clientes'
    },
    purpose: {
      en: 'Automatically guide new clients from signup to dispute readiness.',
      es: 'Guía automáticamente a los clientes desde el registro hasta estar listos para disputar.'
    },
    trigger: {
      en: 'Trigger: New client created in the CRM.',
      es: 'Disparador: Nuevo cliente creado en el CRM.'
    },
    steps: {
      en: [
        'Send welcome email/text with portal login and expectations.',
        'Request IdentityIQ or SmartCredit credentials or secure report upload.',
        'Auto-generate a client folder, assign a case owner, and create kickoff tasks.',
        'Notify the team to begin the credit analysis.'
      ],
      es: [
        'Enviar email/SMS de bienvenida con acceso al portal y expectativas.',
        'Solicitar credenciales de IdentityIQ o SmartCredit, o carga segura del reporte.',
        'Autogenerar carpeta del cliente, asignar responsable y crear tareas iniciales.',
        'Notificar al equipo para iniciar el análisis de crédito.'
      ]
    },
    outcome: {
      en: 'Move clients from signup to “Ready for dispute” without manual busywork.',
      es: 'Lleva a los clientes de registro a “Listo para disputar” sin trabajo manual.'
    },
    kpis: {
      en: ['Lead→Consult %', 'Time-to-Value (hours)', 'Portal login rate'],
      es: ['Lead→Consult %', 'Tiempo hasta valor (horas)', 'Tasa de acceso al portal']
    },
    automations: {
      en: ['Webhook: POST /api/clients → workflow trigger', 'Secure form + vault for IdentityIQ credentials', 'Auto-assign via case routing rules'],
      es: ['Webhook: POST /api/clients → disparador del flujo', 'Formulario seguro + bóveda para credenciales IdentityIQ', 'Autoasignación mediante reglas de enrutamiento de casos']
    },
    upsell: {
      en: 'Pitch a concierge onboarding call ($197) once the client logs in.',
      es: 'Ofrece una llamada concierge de onboarding ($197) después del primer acceso.'
    },
    abTest: {
      en: 'Test SMS-first vs email-first welcome sequences for first-response time.',
      es: 'Prueba secuencias con SMS primero vs email primero para medir la respuesta inicial.'
    }
  },
  {
    id: 'dispute-letter-generation',
    icon: '⚖️',
    segments: ['Disputes', 'Compliance'],
    title: {
      en: 'Dispute Letter Generation Workflow',
      es: 'Flujo de generación de cartas de disputa'
    },
    purpose: {
      en: 'Generate Metro-2 compliant letters and track certified mail automatically.',
      es: 'Genera cartas conforme a Metro-2 y rastrea correo certificado automáticamente.'
    },
    trigger: {
      en: 'Trigger: Violation found or dispute marked ready.',
      es: 'Disparador: Violación detectada o disputa lista.'
    },
    steps: {
      en: [
        'Run Metro-2 parser to detect inaccurate tradelines and reasons.',
        'Auto-generate dispute templates (FCRA, FCBA, etc.).',
        'Send letters via certified mail API (SimpleCertifiedMail, Click2Mail).',
        'Store tracking numbers, timestamp, and mark items as “In dispute”.'
      ],
      es: [
        'Ejecutar el parser Metro-2 para detectar cuentas inexactas y motivos.',
        'Autogenerar plantillas de disputa (FCRA, FCBA, etc.).',
        'Enviar cartas por API de correo certificado (SimpleCertifiedMail, Click2Mail).',
        'Guardar números de rastreo, sello de tiempo y marcar ítems como “En disputa”.'
      ]
    },
    outcome: {
      en: 'Every dispute is mailed, tracked, and auditable without manual prep.',
      es: 'Cada disputa se envía, rastrea y audita sin preparación manual.'
    },
    kpis: {
      en: ['Dispute completion rate', 'Mail turnaround time', 'Violation categories fixed'],
      es: ['Tasa de disputas completadas', 'Tiempo de envío por correo', 'Categorías corregidas']
    },
    automations: {
      en: ['Use metro2-core to score violations before generation', 'Connect to certified mail API + webhook for delivery', 'Sync status back to CRM tasks'],
      es: ['Usa metro2-core para calificar violaciones antes de generar', 'Conecta API de correo certificado + webhook de entrega', 'Sincroniza estado con tareas del CRM']
    },
    upsell: {
      en: 'Bundle “Dispute Concierge” service that handles all certified mail at a premium.',
      es: 'Vende el servicio “Dispute Concierge” que gestiona el correo certificado con tarifa premium.'
    },
    abTest: {
      en: 'Test letter previews vs summary emails for client reassurance.',
      es: 'Prueba vista previa de carta vs email resumen para reforzar la confianza.'
    }
  },
  {
    id: 'round-update',
    icon: '📈',
    segments: ['Disputes', 'Retention'],
    title: {
      en: 'Round Update & Follow-Up Workflow',
      es: 'Flujo de actualización de rondas y seguimiento'
    },
    purpose: {
      en: 'Keep disputes cycling every 30–45 days with automated follow-ups.',
      es: 'Mantén las disputas girando cada 30–45 días con seguimientos automáticos.'
    },
    trigger: {
      en: 'Trigger: 30 days since the last dispute round.',
      es: 'Disparador: 30 días desde la última ronda de disputa.'
    },
    steps: {
      en: [
        'Check for unresolved or unverified items.',
        'Auto-generate follow-up or escalation letters (Method of Verification, CFPB, etc.).',
        'Send a client update and notify staff with next steps.'
      ],
      es: [
        'Revisar ítems no resueltos o no verificados.',
        'Autogenerar cartas de seguimiento o escalación (Método de Verificación, CFPB, etc.).',
        'Enviar actualización al cliente y notificar al equipo con próximos pasos.'
      ]
    },
    outcome: {
      en: 'No missed rounds; every client stays in an active repair cycle.',
      es: 'Sin rondas perdidas; cada cliente permanece en ciclo activo.'
    },
    kpis: {
      en: ['Round completion rate', 'Average days between rounds', 'Client update open rate'],
      es: ['Tasa de rondas completadas', 'Promedio de días entre rondas', 'Tasa de apertura de actualizaciones']
    },
    automations: {
      en: ['Scheduler checks unresolved disputes nightly', 'Auto-create tasks for escalations when 3rd response fails', 'Send multilingual status updates via SMS/email'],
      es: ['Programador revisa disputas pendientes cada noche', 'Autocrear tareas de escalación cuando falla la tercera respuesta', 'Enviar actualizaciones bilingües por SMS/email']
    },
    upsell: {
      en: 'Offer a “Priority Rounds” add-on with accelerated review windows.',
      es: 'Ofrece un add-on “Rondas Prioritarias” con revisiones aceleradas.'
    },
    abTest: {
      en: 'Compare educational vs progress-driven update messaging for retention.',
      es: 'Compara mensajes educativos vs orientados al progreso para retención.'
    }
  },
  {
    id: 'billing-payments',
    icon: '💰',
    segments: ['Finance', 'Revenue'],
    title: {
      en: 'Billing & Payment Reminder Workflow',
      es: 'Flujo de facturación y recordatorios de pago'
    },
    purpose: {
      en: 'Automate invoices, receipts, and payment nudges.',
      es: 'Automatiza facturas, recibos y recordatorios de pago.'
    },
    trigger: {
      en: 'Trigger: Invoice created or payment due date approaching.',
      es: 'Disparador: Factura creada o fecha de pago próxima.'
    },
    steps: {
      en: [
        'Send invoice with payment link (Stripe, PayPal, etc.).',
        'Schedule reminder emails/texts at 3-day intervals.',
        'Auto-pause reminders if payment is received.'
      ],
      es: [
        'Enviar factura con enlace de pago (Stripe, PayPal, etc.).',
        'Programar recordatorios por email/SMS cada 3 días.',
        'Detener recordatorios automáticamente si se recibe el pago.'
      ]
    },
    outcome: {
      en: 'Reduce revenue leakage and manual chasing with automated billing ops.',
      es: 'Reduce la fuga de ingresos y persecución manual con facturación automática.'
    },
    kpis: {
      en: ['Days Sales Outstanding', 'Payment recovery rate', 'Failed payment retry success'],
      es: ['DSO (días de cobro)', 'Tasa de recuperación de pagos', 'Éxito en reintentos de pago']
    },
    automations: {
      en: ['Stripe Checkout sessions via API', 'Webhook to pause reminders on payment success', 'Sync receipts to accounting'],
      es: ['Sesiones de Stripe Checkout vía API', 'Webhook para pausar recordatorios al cobrar', 'Sincronizar recibos con contabilidad']
    },
    upsell: {
      en: 'Introduce premium “Done-for-you billing” for partner agencies.',
      es: 'Introduce “Cobranza gestionada” premium para agencias asociadas.'
    },
    abTest: {
      en: 'Experiment with bilingual payment CTA copy to lift conversion.',
      es: 'Experimenta con CTA de pago bilingüe para mejorar la conversión.'
    }
  },
  {
    id: 'credit-monitoring',
    icon: '🔍',
    segments: ['Monitoring', 'Operations'],
    title: {
      en: 'Credit Monitoring Refresh Workflow',
      es: 'Flujo de actualización de monitoreo de crédito'
    },
    purpose: {
      en: 'Pull updated credit reports each month and flag changes.',
      es: 'Descarga reportes actualizados cada mes y marca los cambios.'
    },
    trigger: {
      en: 'Trigger: Monthly refresh date.',
      es: 'Disparador: Fecha de actualización mensual.'
    },
    steps: {
      en: [
        'Call IdentityIQ/SmartCredit API to request the latest report.',
        'Compare the new report to the previous version and detect changes.',
        'Notify the case owner or client of new items or score shifts.'
      ],
      es: [
        'Llamar a la API de IdentityIQ/SmartCredit para obtener el reporte más reciente.',
        'Comparar el reporte nuevo con el anterior y detectar cambios.',
        'Notificar al responsable o cliente sobre nuevos ítems o cambios de puntaje.'
      ]
    },
    outcome: {
      en: 'Keep CRM data and client progress dashboards up to date.',
      es: 'Mantén el CRM y los tableros de progreso actualizados.'
    },
    kpis: {
      en: ['Refresh completion rate', 'New item detection time', 'Client acknowledgement rate'],
      es: ['Tasa de actualización completada', 'Tiempo para detectar nuevos ítems', 'Tasa de confirmación del cliente']
    },
    automations: {
      en: ['Scheduled cron via server.js', 'Diff engine highlights Metro-2 risk changes', 'Auto-create tasks for new derogatory items'],
      es: ['Cron programado desde server.js', 'Motor de diferencias resalta riesgos Metro-2', 'Autocrear tareas para nuevos negativos']
    },
    upsell: {
      en: 'Offer monthly “Progress Pulse” reports as an add-on subscription.',
      es: 'Ofrece informes mensuales “Progress Pulse” como suscripción adicional.'
    },
    abTest: {
      en: 'Test PDF vs interactive dashboard for monthly update engagement.',
      es: 'Prueba PDF vs panel interactivo para el involucramiento mensual.'
    }
  },
  {
    id: 'compliance-docs',
    icon: '📚',
    segments: ['Compliance', 'Client Success'],
    title: {
      en: 'Compliance & Document Upload Workflow',
      es: 'Flujo de cumplimiento y carga de documentos'
    },
    purpose: {
      en: 'Collect IDs and proof of address before disputes are launched.',
      es: 'Recolecta identificaciones y comprobantes antes de iniciar disputas.'
    },
    trigger: {
      en: 'Trigger: Client signup completed.',
      es: 'Disparador: Registro del cliente completado.'
    },
    steps: {
      en: [
        'Send checklist (ID, proof of address, social security doc last4).',
        'Accept uploads through secure portal with PII redaction.',
        'Mark client as “Verified ID” and move to next pipeline stage.'
      ],
      es: [
        'Enviar checklist (ID, comprobante de domicilio, documento SSN últimos 4).',
        'Aceptar cargas por portal seguro con redacción de PII.',
        'Marcar al cliente como “ID verificada” y avanzar en el pipeline.'
      ]
    },
    outcome: {
      en: 'No compliance delays; disputes stay audit-ready.',
      es: 'Sin retrasos de cumplimiento; disputas listas para auditoría.'
    },
    kpis: {
      en: ['Checklist completion rate', 'Average time to verification', 'Document rejection rate'],
      es: ['Tasa de checklist completada', 'Tiempo promedio para verificar', 'Tasa de rechazo de documentos']
    },
    automations: {
      en: ['Use secure upload widgets with virus/OCR checks', 'Auto-expire links after verification', 'Sync compliance status to CRM stage'],
      es: ['Utiliza widgets seguros con revisión de virus/OCR', 'Autoexpira enlaces tras verificar', 'Sincroniza estado de cumplimiento con el pipeline']
    },
    upsell: {
      en: 'Sell a “Compliance Fast-Track” where staff reviews docs within 2 hours.',
      es: 'Vende “Compliance Fast-Track” con revisión en menos de 2 horas.'
    },
    abTest: {
      en: 'Experiment with video checklist explainer vs static text for completion.',
      es: 'Experimenta video explicativo vs texto estático para mejorar la finalización.'
    }
  },
  {
    id: 're-engagement',
    icon: '🔄',
    segments: ['Sales', 'Marketing'],
    title: {
      en: 'Re-Engagement Workflow (Leads → Clients)',
      es: 'Flujo de reactivación (prospectos → clientes)'
    },
    purpose: {
      en: 'Convert cold leads or former clients via educational drips.',
      es: 'Convierte prospectos fríos o ex clientes con campañas educativas.'
    },
    trigger: {
      en: 'Trigger: Lead inactive for 14+ days.',
      es: 'Disparador: Prospecto inactivo por 14+ días.'
    },
    steps: {
      en: [
        'Send educational message on why consistent credit care matters.',
        'Deliver a limited-time promo or consultation offer.',
        'Auto-assign to a rep if the lead replies or clicks.'
      ],
      es: [
        'Enviar mensaje educativo sobre la importancia del cuidado crediticio.',
        'Ofrecer promoción por tiempo limitado o consulta.',
        'Autoasignar a un asesor si el prospecto responde o hace clic.'
      ]
    },
    outcome: {
      en: 'Revive dormant leads automatically and feed the sales calendar.',
      es: 'Reactiva prospectos dormidos automáticamente y llena la agenda de ventas.'
    },
    kpis: {
      en: ['Reactivation rate', 'Consult bookings from drip', 'Offer acceptance rate'],
      es: ['Tasa de reactivación', 'Consultas agendadas desde la secuencia', 'Tasa de aceptación de oferta']
    },
    automations: {
      en: ['Segment leads by inactivity in CRM', 'Send bilingual drip via Twilio/SendGrid', 'Webhook to create NEPQ task when a reply lands'],
      es: ['Segmentar prospectos por inactividad en el CRM', 'Enviar drip bilingüe con Twilio/SendGrid', 'Webhook para crear tarea NEPQ cuando llega respuesta']
    },
    upsell: {
      en: 'Bundle a “Credit Readiness Audit” for reactivated leads at a special price.',
      es: 'Incluye “Auditoría de preparación crediticia” a precio especial para reactivados.'
    },
    abTest: {
      en: 'Test urgency-based vs story-based copy for lead reply rate.',
      es: 'Prueba copy con urgencia vs storytelling para la tasa de respuesta.'
    }
  },
  {
    id: 'audit-reporting',
    icon: '🧾',
    segments: ['Analytics', 'Client Success'],
    title: {
      en: 'Audit & Reporting Workflow',
      es: 'Flujo de auditoría y reportes'
    },
    purpose: {
      en: 'Calculate dispute success rates and share progress summaries.',
      es: 'Calcula tasas de éxito y comparte resúmenes de progreso.'
    },
    trigger: {
      en: 'Trigger: Dispute round completed.',
      es: 'Disparador: Ronda de disputa completada.'
    },
    steps: {
      en: [
        'Calculate deleted/updated item percentage from the latest round.',
        'Update the client progress chart inside the CRM.',
        'Send a progress report email with next recommended actions.'
      ],
      es: [
        'Calcular porcentaje de ítems eliminados/actualizados en la última ronda.',
        'Actualizar el gráfico de progreso del cliente en el CRM.',
        'Enviar email de progreso con las próximas acciones recomendadas.'
      ]
    },
    outcome: {
      en: 'Show visible results to increase retention and referrals.',
      es: 'Muestra resultados visibles para aumentar retención y referidos.'
    },
    kpis: {
      en: ['Report delivery rate', 'Client satisfaction score', 'Referral requests sent'],
      es: ['Tasa de entrega de reportes', 'Puntaje de satisfacción', 'Solicitudes de referidos enviadas']
    },
    automations: {
      en: ['Leverage reportPipeline.js for calculations', 'Embed bilingual insights in email templates', 'Push summary to client portal timeline'],
      es: ['Usa reportPipeline.js para cálculos', 'Incluye insights bilingües en las plantillas', 'Publica resumen en la línea de tiempo del portal']
    },
    upsell: {
      en: 'Offer quarterly strategy sessions reviewing these reports.',
      es: 'Ofrece sesiones estratégicas trimestrales basadas en los reportes.'
    },
    abTest: {
      en: 'Compare video recap vs PDF summary for engagement.',
      es: 'Compara video resumen vs PDF para medir engagement.'
    }
  },
  {
    id: 'escalation',
    icon: '🔧',
    segments: ['Compliance', 'Disputes'],
    title: {
      en: 'Escalation Workflow (CFPB / AG / CRA)',
      es: 'Flujo de escalación (CFPB / Fiscal General / CRA)'
    },
    purpose: {
      en: 'Escalate repeated violations to regulators with full documentation.',
      es: 'Escala violaciones repetidas a reguladores con documentación completa.'
    },
    trigger: {
      en: 'Trigger: 3+ unverified responses from a bureau.',
      es: 'Disparador: 3+ respuestas no verificadas de una agencia.'
    },
    steps: {
      en: [
        'Auto-generate a complaint packet (CFPB, Attorney General, etc.).',
        'Email compliance officer or admin for approval.',
        'Track escalation status and follow-up deadlines.'
      ],
      es: [
        'Autogenerar paquete de queja (CFPB, Fiscal General, etc.).',
        'Notificar por email al oficial de cumplimiento o administrador.',
        'Rastrear estado de escalación y fechas límite.'
      ]
    },
    outcome: {
      en: 'Adds professionalism and pressure without manual handling.',
      es: 'Aporta profesionalismo y presión sin manejo manual.'
    },
    kpis: {
      en: ['Escalation success rate', 'Average approval time', 'Regulator response time'],
      es: ['Tasa de éxito en escalaciones', 'Tiempo promedio de aprobación', 'Tiempo de respuesta del regulador']
    },
    automations: {
      en: ['Auto-fill complaint forms with metro2-core data', 'Securely store supporting evidence', 'Create compliance tasks with due dates'],
      es: ['Autocompletar formularios con datos de metro2-core', 'Almacenar evidencia de forma segura', 'Crear tareas de cumplimiento con fechas límite']
    },
    upsell: {
      en: 'Offer an “Agency escalation” add-on for clients needing regulator support.',
      es: 'Ofrece un add-on de “Escalación a agencias” para clientes que lo requieran.'
    },
    abTest: {
      en: 'Test long-form vs bullet-point client updates post-escalation.',
      es: 'Prueba actualizaciones detalladas vs en viñetas tras la escalación.'
    }
  },
  {
    id: 'referral-review',
    icon: '💼',
    segments: ['Marketing', 'Retention'],
    title: {
      en: 'Referral & Review Workflow',
      es: 'Flujo de referidos y reseñas'
    },
    purpose: {
      en: 'Convert happy clients into promoters and referral sources.',
      es: 'Convierte clientes satisfechos en promotores y referidores.'
    },
    trigger: {
      en: 'Trigger: Score improvement > 80 points or dispute success rate > 70%.',
      es: 'Disparador: Mejora de puntaje > 80 puntos o tasa de éxito > 70%.'
    },
    steps: {
      en: [
        'Send thank-you note with Google/Facebook review link.',
        'Offer a referral bonus or partner incentive.',
        'Notify marketing when a review or referral is submitted.'
      ],
      es: [
        'Enviar nota de agradecimiento con enlace a reseña (Google/Facebook).',
        'Ofrecer bono por referido o incentivo de socio.',
        'Notificar a marketing cuando se recibe reseña o referido.'
      ]
    },
    outcome: {
      en: 'Automated word-of-mouth that compounds lifetime value.',
      es: 'Boca a boca automatizado que aumenta el valor de vida del cliente.'
    },
    kpis: {
      en: ['Review submission rate', 'Referral to consult %', 'Net Promoter Score'],
      es: ['Tasa de reseñas enviadas', 'Referido a consulta %', 'Net Promoter Score']
    },
    automations: {
      en: ['Trigger from analytics webhook when thresholds met', 'Use review request API (NiceJob, Birdeye)', 'Send referral payouts through Stripe'],
      es: ['Disparar desde webhook analítico cuando se cumplan umbrales', 'Usar API de reseñas (NiceJob, Birdeye)', 'Enviar bonos de referido vía Stripe']
    },
    upsell: {
      en: 'Introduce a “VIP Rewards Club” for clients who bring 3+ referrals.',
      es: 'Introduce un “Club de Recompensas VIP” para clientes con 3+ referidos.'
    },
    abTest: {
      en: 'Test testimonial video request vs written review CTA.',
      es: 'Prueba solicitud de video testimonio vs CTA de reseña escrita.'
    }
  }
];

const state = {
  language: (typeof localStorage !== 'undefined' && localStorage.getItem('workflowLanguage')) || 'en',
  segment: 'all'
};

const langButtons = document.querySelectorAll('.lang-toggle');
const segmentSelect = document.getElementById('segmentFilter');
const grid = document.getElementById('workflowGrid');

function renderFilters() {
  const segments = new Set();
  workflows.forEach((wf) => wf.segments.forEach((seg) => segments.add(seg)));
  segments.forEach((segment) => {
    if (!segmentSelect.querySelector(`option[value="${segment}"]`)) {
      const option = document.createElement('option');
      option.value = segment;
      option.textContent = segment;
      segmentSelect.appendChild(option);
    }
  });
  segmentSelect.value = state.segment;
}

function badgeTemplate(segment) {
  return `<span class="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">${segment}</span>`;
}

function listTemplate(items) {
  return items.map((item) => `<li class="flex gap-2 text-sm text-slate-600"><span class="text-slate-400">•</span><span>${item}</span></li>`).join('');
}

function stepTemplate(steps) {
  return steps
    .map(
      (step, index) => `
      <li class="flex gap-3 text-sm text-slate-700">
        <span class="font-semibold text-slate-500">${index + 1}.</span>
        <span>${step}</span>
      </li>`
    )
    .join('');
}

function renderWorkflows() {
  const { language, segment } = state;
  grid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  workflows
    .filter((wf) => segment === 'all' || wf.segments.includes(segment))
    .forEach((wf) => {
      const article = document.createElement('article');
      article.className = 'glass card p-6 space-y-4 shadow-sm';
      article.dataset.workflowId = wf.id;

      article.innerHTML = `
        <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div class="flex items-start gap-3">
            <span class="text-3xl" aria-hidden="true">${wf.icon}</span>
            <div>
              <h2 class="text-xl font-semibold">${wf.title[language]}</h2>
              <p class="text-sm text-slate-600">${wf.purpose[language]}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">${wf.segments.map(badgeTemplate).join('')}</div>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-3">
            <p class="text-sm font-semibold text-slate-500">${wf.trigger[language]}</p>
            <ol class="space-y-2">${stepTemplate(wf.steps[language])}</ol>
            <p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">${wf.outcome[language]}</p>
          </div>
          <div class="space-y-3">
            <div>
              <h3 class="text-sm font-semibold text-slate-700">KPIs / Indicadores</h3>
              <ul class="space-y-1">${listTemplate(wf.kpis[language])}</ul>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-slate-700">Automation / Automatización</h3>
              <ul class="space-y-1">${listTemplate(wf.automations[language])}</ul>
            </div>
            <div class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              <p class="font-semibold text-slate-900">Upsell</p>
              <p>${wf.upsell[language]}</p>
            </div>
            <div class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              <p class="font-semibold text-slate-900">A/B Idea</p>
              <p>${wf.abTest[language]}</p>
            </div>
          </div>
        </div>
      `;

      fragment.appendChild(article);
    });

  grid.appendChild(fragment);
}

function updateLanguage(lang) {
  state.language = lang;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('workflowLanguage', lang);
  }
  langButtons.forEach((btn) => {
    if (btn.dataset.lang === lang) {
      btn.classList.add('bg-white', 'font-semibold', 'text-slate-900');
    } else {
      btn.classList.remove('bg-white', 'font-semibold', 'text-slate-900');
    }
  });
  renderWorkflows();
}

langButtons.forEach((btn) => {
  btn.addEventListener('click', () => updateLanguage(btn.dataset.lang));
});

segmentSelect.addEventListener('change', (event) => {
  state.segment = event.target.value;
  renderWorkflows();
});

renderFilters();
updateLanguage(state.language);
