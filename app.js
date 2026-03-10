const inputText = document.getElementById('inputText');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const exampleBtn = document.getElementById('exampleBtn');
const exportBtn = document.getElementById('exportBtn');
const fileInput = document.getElementById('fileInput');
const modeButtons = document.querySelectorAll('.mode-btn');

const detectedTypeEl = document.getElementById('detectedType');
const scoreEl = document.getElementById('score');
const checksListEl = document.getElementById('checksList');
const observationsEl = document.getElementById('observations');
const testCasesEl = document.getElementById('testCases');

let selectedMode = 'auto';
let generatedCases = [];

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeButtons.forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    selectedMode = btn.dataset.mode;
  });
});

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  inputText.value = text;
});

exampleBtn.addEventListener('click', () => {
  if (selectedMode === 'api') {
    inputText.value = `POST /orders\nRequest body: {"customerId":"123","items":[{"sku":"A1","qty":1}]}\nResponse 201: {"orderId":"ORD-1","status":"created"}\nErrores: 400, 401, 500\nAuth: Bearer token`;
  } else {
    inputText.value = `Como cliente de e-commerce quiero consultar el estado de mi pedido para conocer la fecha de entrega y planificar mi recepción.\n\nCriterios de aceptación:\nGiven que tengo un pedido activo, when ingreso al detalle del pedido, then visualizo el estado y la fecha estimada de entrega.\nGiven que el pedido está cancelado, when consulto el detalle, then visualizo estado cancelado y motivo.\nReglas: solo usuarios autenticados pueden ver su propio pedido.`;
  }
});

analyzeBtn.addEventListener('click', () => {
  const content = inputText.value.trim();
  if (!content) {
    alert('Ingresa o sube una historia de usuario o contrato API.');
    return;
  }

  const detectedType = getContentType(content);
  const result = detectedType === 'Historia de usuario' ? validateUserStory(content) : validateApiContract(content);

  renderValidation(detectedType, result);
  if (result.isValid) {
    generatedCases = generateTestCases(detectedType, content);
    renderTestCases(generatedCases);
    exportBtn.disabled = false;
  } else {
    generatedCases = [];
    exportBtn.disabled = true;
    testCasesEl.innerHTML = '<p class="placeholder">No se generan casos hasta resolver las observaciones.</p>';
  }
});

clearBtn.addEventListener('click', () => {
  inputText.value = '';
  fileInput.value = '';
  generatedCases = [];
  exportBtn.disabled = true;
  detectedTypeEl.textContent = 'Tipo detectado: —';
  scoreEl.textContent = 'Puntaje: —';
  checksListEl.innerHTML = '';
  observationsEl.innerHTML = '<div class="placeholder">Aún no hay observaciones.</div>';
  testCasesEl.innerHTML = '<div class="placeholder">Analiza un contenido válido para generar casos.</div>';
});

exportBtn.addEventListener('click', () => {
  if (generatedCases.length === 0) return;
  const header = 'id,titulo,prioridad,tipo,resultado_esperado';
  const rows = generatedCases.map((t, i) => `${i + 1},"${t.title}",${t.priority},${t.type},"${t.expected}"`);
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'casos-prueba.csv';
  a.click();
  URL.revokeObjectURL(url);
});

function getContentType(text) {
  if (selectedMode === 'story') return 'Historia de usuario';
  if (selectedMode === 'api') return 'Contrato API';
  const apiIndicators = /(openapi|swagger|paths:|\bGET\b|\bPOST\b|\bPUT\b|\bDELETE\b|\/\w+)/i;
  return apiIndicators.test(text) ? 'Contrato API' : 'Historia de usuario';
}

function validateUserStory(text) {
  const checks = [];
  const observations = [];
  let passed = 0;

  const normalized = text.replace(/\n/g, ' ');
  const template = /como\s+.+\s+quiero\s+.+\s+para\s+.+/i.test(normalized);
  addCheck(checks, template, 'Estructura estándar (Como/Quiero/Para)', 'err');
  if (!template) observations.push('Define rol, objetivo y beneficio en formato: Como... Quiero... Para...');
  passed += template ? 1 : 0;

  const acceptance = /(given|when|then|criterios? de aceptación|aceptaci[oó]n)/i.test(text);
  addCheck(checks, acceptance, 'Criterios de aceptación verificables', 'warn');
  if (!acceptance) observations.push('Agrega criterios de aceptación medibles (ideal: Given/When/Then).');
  passed += acceptance ? 1 : 0;

  const businessRules = /(regla|restricci[oó]n|no debe|debe|solo|únicamente)/i.test(text);
  addCheck(checks, businessRules, 'Reglas de negocio explícitas', 'warn');
  if (!businessRules) observations.push('Incluye reglas de negocio y restricciones funcionales.');
  passed += businessRules ? 1 : 0;

  const testable = text.split(/\s+/).length >= 35;
  addCheck(checks, testable, 'Nivel de detalle suficiente para pruebas', 'warn');
  if (!testable) observations.push('Amplía el detalle funcional y condiciones límite para mejores pruebas.');
  passed += testable ? 1 : 0;

  const score = Math.round((passed / checks.length) * 100);
  return { checks, observations, score, isValid: score >= 75 && template };
}

function validateApiContract(text) {
  const checks = [];
  const observations = [];
  let passed = 0;

  const endpoints = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[\w\-\/{}/]*/g) || [];
  const hasEndpoints = endpoints.length > 0;
  addCheck(checks, hasEndpoints, 'Endpoints con método y ruta', 'err');
  if (!hasEndpoints) observations.push('Incluye endpoints: GET /recurso, POST /recurso, etc.');
  passed += hasEndpoints ? 1 : 0;

  const hasRequest = /(request|body|payload|query|path|par[aá]metros)/i.test(text);
  addCheck(checks, hasRequest, 'Entrada definida (body/query/path)', 'warn');
  if (!hasRequest) observations.push('Define estructura de request y campos obligatorios.');
  passed += hasRequest ? 1 : 0;

  const hasResponses = /(response|respuesta|status|200|201|400|401|403|404|500)/i.test(text);
  addCheck(checks, hasResponses, 'Respuestas y códigos HTTP', 'warn');
  if (!hasResponses) observations.push('Documenta respuestas esperadas y códigos de error.');
  passed += hasResponses ? 1 : 0;

  const hasSchema = /(type:|schema|properties|required|json)/i.test(text);
  addCheck(checks, hasSchema, 'Esquema de datos identificado', 'warn');
  if (!hasSchema) observations.push('Agrega esquema o ejemplo JSON de request/response.');
  passed += hasSchema ? 1 : 0;

  const score = Math.round((passed / checks.length) * 100);
  return { checks, observations, score, isValid: score >= 75 && hasEndpoints };
}

function addCheck(list, condition, label, failLevel) {
  list.push({ label, status: condition ? 'ok' : failLevel });
}

function renderValidation(type, result) {
  detectedTypeEl.textContent = `Tipo detectado: ${type}`;
  scoreEl.textContent = `Puntaje: ${result.score}/100 ${result.isValid ? '✅ Aprobado' : '⚠️ Requiere ajustes'}`;

  checksListEl.innerHTML = '';
  result.checks.forEach((c) => {
    const li = document.createElement('li');
    li.textContent = c.label;
    li.className = c.status === 'ok' ? 'check-ok' : c.status === 'warn' ? 'check-warn' : 'check-err';
    checksListEl.appendChild(li);
  });

  if (!result.observations.length) {
    observationsEl.innerHTML = '<p>Sin observaciones. Contenido apto para generar pruebas.</p>';
    return;
  }

  observationsEl.innerHTML = `<ul class="observations-list">${result.observations.map((o) => `<li>${o}</li>`).join('')}</ul>`;
}

function generateTestCases(type, content) {
  if (type === 'Historia de usuario') {
    return [
      { title: 'Flujo principal cumple objetivo del usuario', priority: 'Alta', type: 'Funcional', expected: 'Usuario completa la acción y obtiene resultado esperado.' },
      { title: 'Validar criterio Given/When/Then #1', priority: 'Alta', type: 'Aceptación', expected: 'Se cumple exactamente el criterio declarado.' },
      { title: 'Escenario negativo con datos inválidos', priority: 'Media', type: 'Negativo', expected: 'Sistema bloquea operación y muestra mensaje claro.' },
      { title: 'Control de autorización por rol', priority: 'Media', type: 'Seguridad', expected: 'Solo usuarios permitidos acceden al flujo.' }
    ];
  }

  const endpoints = [...content.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w\-\/{}/]*)/g)];
  const tests = [];
  endpoints.forEach((m) => {
    const method = m[1];
    const path = m[2];
    tests.push({ title: `${method} ${path} responde éxito`, priority: 'Alta', type: 'API', expected: 'Retorna código 2xx con estructura esperada.' });
    tests.push({ title: `${method} ${path} valida campos obligatorios`, priority: 'Alta', type: 'API Negativo', expected: 'Retorna 4xx cuando faltan campos requeridos.' });
    tests.push({ title: `${method} ${path} con credenciales inválidas`, priority: 'Media', type: 'Seguridad API', expected: 'Retorna 401/403 si autenticación falla.' });
  });

  return tests;
}

function renderTestCases(cases) {
  if (!cases.length) {
    testCasesEl.textContent = 'No se detectaron casos automáticos.';
    return;
  }
  testCasesEl.innerHTML = `<ol class="test-list">${cases.map((c) => `<li class="test-case"><strong>${c.title}</strong><br><small>Tipo: ${c.type} | Prioridad: ${c.priority}</small><br>Esperado: ${c.expected}</li>`).join('')}</ol>`;
}
